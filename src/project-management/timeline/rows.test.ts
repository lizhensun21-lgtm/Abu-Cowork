import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectProjectListRows } from '../application/projectList';
import { createEmptyProjectGraph } from '../domain/projectGraph';
import type { Milestone, ProjectGraph, ProjectTimeline } from '../domain/types';
import { getTimelineRowForMilestone, selectTimelineRows } from './rows';

function timeline(projectId: string, lane: ProjectTimeline['lane']): ProjectTimeline {
  return {
    id: `${projectId}-${lane}`, projectId, lane, name: `${lane} Plan`,
    startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [],
  };
}

function milestone(projectId: string, lane: Milestone['lane']): Milestone {
  return {
    id: `${projectId}-${lane}-milestone`, projectId,
    timelineId: `${projectId}-${lane}`, lane, title: `${lane} Gate`,
    date: '2026-05-01', code: 'G1', status: 'not_started',
  };
}

function graph(): ProjectGraph {
  return {
    ...createEmptyProjectGraph(),
    projects: [
      { id: 'project-b', name: 'Second', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' },
      { id: 'project-a', name: 'First', projectStatus: 'planning', startDate: '2026-01-01', endDate: '2026-12-31' },
    ],
    projectTimelines: [
      timeline('project-a', 'OEM'), timeline('project-b', 'Tier1'),
      timeline('project-a', 'YD'), timeline('project-b', 'YD'),
      timeline('project-a', 'Tier1'),
    ],
    milestones: [
      milestone('project-a', 'OEM'), milestone('project-a', 'YD'),
      milestone('project-b', 'Tier1'),
    ],
    projectTeams: [{ projectId: 'project-b' }, { projectId: 'project-a' }],
  };
}

describe('Timeline row projection', () => {
  it('shares Project ordering with Project List and uses YD, Tier1, OEM lane order', () => {
    const source = graph();
    const rows = selectTimelineRows(source);
    const rowProjectOrder = [...new Set(rows.map((row) => row.projectId))];

    expect(rowProjectOrder).toEqual(selectProjectListRows(source).map((row) => row.projectId));
    expect(rows.map((row) => `${row.projectId}:${row.lane}`)).toEqual([
      'project-b:YD', 'project-b:Tier1',
      'project-a:YD', 'project-a:Tier1', 'project-a:OEM',
    ]);
  });

  it('projects each Milestone only into its exact timeline row', () => {
    const rows = selectTimelineRows(graph());
    expect(rows.find((row) => row.timelineId === 'project-a-YD')?.milestones.map((item) => item.id))
      .toEqual(['project-a-YD-milestone']);
    expect(rows.find((row) => row.timelineId === 'project-a-OEM')?.milestones.map((item) => item.id))
      .toEqual(['project-a-OEM-milestone']);
    expect(getTimelineRowForMilestone(rows, milestone('project-b', 'Tier1'))?.timelineId)
      .toBe('project-b-Tier1');
  });

  it('rejects orphan and mismatched relations instead of falling back to YD', () => {
    const source = graph();
    source.projectTimelines.push({ ...timeline('missing', 'YD'), id: 'orphan-timeline' });
    source.milestones.push(
      { ...milestone('project-a', 'YD'), id: 'orphan', timelineId: 'missing' },
      { ...milestone('project-a', 'YD'), id: 'wrong-lane', lane: 'OEM' },
    );
    const rows = selectTimelineRows(source);

    expect(rows.some((row) => row.timelineId === 'orphan-timeline')).toBe(false);
    expect(rows.flatMap((row) => row.milestones).map((item) => item.id))
      .not.toEqual(expect.arrayContaining(['orphan', 'wrong-lane']));
  });

  it('does not project a conflicting duplicate lane or duplicate Timeline ID', () => {
    const duplicateLane = graph();
    duplicateLane.projectTimelines.push({
      ...timeline('project-a', 'OEM'), id: 'project-a-OEM-duplicate',
    });
    expect(selectTimelineRows(duplicateLane).some((row) => (
      row.projectId === 'project-a' && row.lane === 'OEM'
    ))).toBe(false);

    const duplicateId = graph();
    duplicateId.projectTimelines.push({
      ...timeline('project-a', 'OEM'), projectId: 'project-b', lane: 'OEM',
    });
    expect(selectTimelineRows(duplicateId).some((row) => (
      row.timelineId === 'project-a-OEM'
    ))).toBe(false);
  });

  it('keeps TimelineMilestone as a frozen projection without mutating the source graph', () => {
    const source = graph();
    const before = structuredClone(source);
    const projected = selectTimelineRows(source)
      .find((row) => row.timelineId === 'project-a-OEM')?.milestones[0];

    expect(projected).toBeDefined();
    expect(Object.isFrozen(projected)).toBe(true);
    expect(projected).not.toBe(source.milestones.find((item) => item.id === projected?.id));
    expect(source).toEqual(before);
  });

  it('has no React, DOM, Zustand, Desktop projectStore, or persistence dependency', () => {
    const files = ['coordinates.ts', 'range.ts', 'rows.ts', 'scale.ts'];
    const source = files.map((file) => readFileSync(
      resolve('src/project-management/timeline', file), 'utf8',
    )).join('\n');

    expect(source).not.toMatch(/from ['"]react|document\.|window\.|HTMLElement|MouseEvent/);
    expect(source).not.toMatch(/zustand|stores\/projectStore|localStorage|Repository|electron|ipc/);
  });
});
