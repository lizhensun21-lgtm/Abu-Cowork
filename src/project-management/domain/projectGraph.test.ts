import { describe, expect, it } from 'vitest';
import {
  normalizeProjectGraph,
  validateProjectGraph,
} from './projectGraph';
import { projectMembershipId } from './projectMembership';
import { toTimelineMilestone } from './timelineMilestone';
import type { ProjectGraph } from './types';

function makeValidGraph(): ProjectGraph {
  return {
    projects: [{
      id: 'project-1',
      name: 'Project One',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      projectStatus: 'active',
      projectCode: 'ABU-001',
    }],
    projectTimelines: [{
      id: 'timeline-yd',
      projectId: 'project-1',
      lane: 'YD',
      name: 'YD Plan',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      keyResources: [],
    }],
    milestones: [{
      id: 'milestone-1',
      projectId: 'project-1',
      timelineId: 'timeline-yd',
      lane: 'YD',
      title: 'Concept gate',
      date: '2026-02-01',
      code: 'G0',
      status: 'not_started',
    }],
    persons: [{ id: 'person-1', name: 'Alex' }],
    projectMemberships: [{
      id: projectMembershipId('project-1', 'person-1'),
      projectId: 'project-1',
      personId: 'person-1',
      roles: ['project_manager'],
      status: 'active',
    }],
    projectTeams: [{ projectId: 'project-1' }],
  };
}

function codes(graph: ProjectGraph): string[] {
  return validateProjectGraph(graph).issues.map((issue) => issue.code);
}

describe('Project Management ProjectGraph validation', () => {
  it('accepts a valid core graph', () => {
    expect(validateProjectGraph(makeValidGraph())).toEqual({ valid: true, issues: [] });
  });

  it('rejects duplicate entity IDs', () => {
    const graph = makeValidGraph();
    graph.projects.push({ ...graph.projects[0] });
    expect(codes(graph)).toContain('duplicate-id');
  });

  it('rejects an orphan timeline', () => {
    const graph = makeValidGraph();
    graph.projectTimelines[0].projectId = 'missing-project';
    expect(codes(graph)).toContain('orphan-timeline');
  });

  it('rejects orphan milestone references', () => {
    const missingProject = makeValidGraph();
    missingProject.milestones[0].projectId = 'missing-project';
    expect(codes(missingProject)).toContain('orphan-milestone-project');

    const missingTimeline = makeValidGraph();
    missingTimeline.milestones[0].timelineId = 'missing-timeline';
    expect(codes(missingTimeline)).toContain('orphan-milestone-timeline');
  });

  it('requires a milestone timeline to belong to the same project', () => {
    const graph = makeValidGraph();
    graph.projects.push({
      id: 'project-2',
      name: 'Project Two',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      projectStatus: 'planning',
    });
    graph.projectTimelines.push({
      ...graph.projectTimelines[0],
      id: 'timeline-yd-2',
      projectId: 'project-2',
    });
    graph.milestones[0].projectId = 'project-2';
    expect(codes(graph)).toContain('milestone-project-mismatch');
  });

  it('requires exactly one YD timeline per project', () => {
    const noYd = makeValidGraph();
    noYd.projectTimelines = [];
    expect(codes(noYd)).toContain('invalid-yd-count');

    const duplicateYd = makeValidGraph();
    duplicateYd.projectTimelines.push({
      ...duplicateYd.projectTimelines[0],
      id: 'timeline-yd-duplicate',
    });
    expect(codes(duplicateYd)).toEqual(
      expect.arrayContaining(['duplicate-project-lane', 'invalid-yd-count']),
    );
  });

  it.each(['OEM', 'Tier1'] as const)(
    'allows at most one %s timeline per project',
    (lane) => {
      const graph = makeValidGraph();
      graph.projectTimelines.push(
        {
          ...graph.projectTimelines[0],
          id: `timeline-${lane}-1`,
          lane,
        },
        {
          ...graph.projectTimelines[0],
          id: `timeline-${lane}-2`,
          lane,
        },
      );
      expect(codes(graph)).toContain('duplicate-project-lane');
    },
  );

  it('rejects invalid membership references', () => {
    const missingPerson = makeValidGraph();
    missingPerson.projectMemberships[0].personId = 'missing-person';
    expect(codes(missingPerson)).toContain('orphan-membership-person');

    const missingProject = makeValidGraph();
    missingProject.projectMemberships[0].projectId = 'missing-project';
    expect(codes(missingProject)).toContain('orphan-membership-project');
  });

  it('rejects an orphan or duplicate ProjectTeam boundary', () => {
    const graph = makeValidGraph();
    graph.projectTeams.push(
      { projectId: 'project-1' },
      { projectId: 'missing-project' },
    );
    expect(codes(graph)).toEqual(
      expect.arrayContaining(['duplicate-project-team', 'orphan-project-team']),
    );
  });

  it('normalizes roles without creating a compatibility ProjectMember', () => {
    const graph = makeValidGraph();
    graph.projectMemberships[0].roles = ['member', 'software_owner', 'member'];
    const normalized = normalizeProjectGraph(graph);
    expect(normalized.projectMemberships[0].roles).toEqual(['software_owner']);
    expect(normalized).not.toHaveProperty('projectMembers');
  });

  it('rejects legacy Project hierarchy and ProjectTeam member fields', () => {
    const graph = makeValidGraph();
    Object.assign(graph.projects[0], { parentId: 'legacy-parent', lane: 'legacy-lane' });
    Object.assign(graph.projectTeams[0], { memberIds: ['person-1'] });
    expect(codes(graph)).toEqual(expect.arrayContaining([
      'legacy-project-field',
      'legacy-project-team-field',
    ]));
  });

  it('projects Milestone as a frozen read-only value without changing status', () => {
    const milestone = makeValidGraph().milestones[0];
    const projection = toTimelineMilestone(milestone);

    expect(projection).not.toBe(milestone);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(projection).toMatchObject({
      name: 'Concept gate',
      stageGate: 'G0',
      status: 'not_started',
    });
    expect(Reflect.set(projection, 'status', 'completed')).toBe(false);
    expect(milestone.status).toBe('not_started');
  });
});
