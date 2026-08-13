import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '../domain/projectGraph';
import { projectMembershipId } from '../domain/projectMembership';
import type { ProjectGraph } from '../domain/types';
import { selectProjectListRows } from './projectList';

function graphWithProjects(): ProjectGraph {
  return {
    ...createEmptyProjectGraph(),
    projects: [
      {
        id: 'project-b', name: 'Second', projectCode: 'PM-002',
        projectStatus: 'planning', startDate: '2026-02-01', endDate: '2026-12-31',
      },
      {
        id: 'project-a', name: 'First',
        projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-11-30',
      },
    ],
    projectTimelines: [
      {
        id: 'timeline-b', projectId: 'project-b', lane: 'YD', name: 'YD',
        startDate: '2026-02-01', endDate: '2026-12-31', keyResources: [],
      },
      {
        id: 'timeline-a', projectId: 'project-a', lane: 'YD', name: 'YD',
        startDate: '2026-01-01', endDate: '2026-11-30', keyResources: [],
      },
    ],
    persons: [{ id: 'person-a', name: 'Alex Chen' }],
    projectMemberships: [{
      id: projectMembershipId('project-a', 'person-a'),
      projectId: 'project-a',
      personId: 'person-a',
      roles: ['project_manager'],
      status: 'active',
    }],
    projectTeams: [{ projectId: 'project-b' }, { projectId: 'project-a' }],
    milestones: [
      {
        id: 'done', projectId: 'project-a', timelineId: 'timeline-a', lane: 'YD',
        title: 'Done', date: '2026-03-01', code: 'G0', status: 'completed',
      },
      {
        id: 'open', projectId: 'project-a', timelineId: 'timeline-a', lane: 'YD',
        title: 'Open', date: '2026-04-01', code: 'G1', status: 'not_started',
      },
    ],
  };
}

describe('Project List read-only projection', () => {
  it('keeps canonical ProjectGraph order and identity fields', () => {
    const rows = selectProjectListRows(graphWithProjects());

    expect(rows.map((row) => row.projectId)).toEqual(['project-b', 'project-a']);
    expect(rows[0]).toMatchObject({ projectCode: 'PM-002', projectName: 'Second' });
    expect(rows[1]).toMatchObject({ projectName: 'First', projectStatus: 'active' });
    expect(rows[1]).not.toHaveProperty('projectCode');
  });

  it('resolves only an active project_manager through Person and Membership', () => {
    const graph = graphWithProjects();
    expect(selectProjectListRows(graph)[1].projectManagerName).toBe('Alex Chen');

    graph.projectMemberships[0].status = 'inactive';
    expect(selectProjectListRows(graph)[1].projectManagerName).toBeUndefined();
    expect(selectProjectListRows(graph)[0].projectManagerName).toBeUndefined();
  });

  it('summarizes only canonical Milestone relationships and explicit status', () => {
    const graph = graphWithProjects();
    graph.milestones.push({
      ...graph.milestones[0],
      id: 'wrong-project',
      projectId: 'project-b',
    });

    expect(selectProjectListRows(graph)[1].milestoneSummary).toEqual({
      completed: 1,
      total: 2,
    });
    expect(selectProjectListRows(graph)[0].milestoneSummary).toBeUndefined();
  });

  it('is deterministic, frozen, and does not mutate ProjectGraph', () => {
    const graph = graphWithProjects();
    const before = structuredClone(graph);
    const first = selectProjectListRows(graph);
    const second = selectProjectListRows(graph);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(graph).toEqual(before);
  });

  it('keeps the production Project List isolated from Desktop projectStore and mockData', () => {
    const productionFiles = [
      'src/project-management/application/projectList.ts',
      'src/components/project-management/ProjectList.tsx',
      'src/components/project-management/ProjectManagementWorkspace.tsx',
    ];
    const source = productionFiles
      .map((file) => readFileSync(resolve(file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/stores\/projectStore|types\/project/);
    expect(source).not.toMatch(/mockData/);
    expect(source).not.toMatch(/commitProjectManagementGraph|setState|setGraph/);
  });
});
