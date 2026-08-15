import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import { createProjectManagementStore } from '../state/projectManagementStore';
import {
  moveProjectTimeline,
  ProjectTimelineMutationConflictError,
  resizeProjectTimeline,
} from './timelineCommands';

function graphFixture(): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' }],
    projectTimelines: [
      { id: 'yd', projectId: 'p1', lane: 'YD', name: 'YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
      { id: 'oem', projectId: 'p1', lane: 'OEM', name: 'OEM', startDate: '2026-02-01', endDate: '2026-10-31', keyResources: [] },
    ],
    milestones: [
      { id: 'm1', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'First', date: '2026-03-08', code: 'G1', status: 'at_risk' },
      { id: 'm2', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'Second', date: '2026-04-10', code: 'G2', status: 'completed' },
      { id: 'other', projectId: 'p1', timelineId: 'oem', lane: 'OEM', title: 'Other', date: '2026-05-01', code: 'G3', status: 'blocked' },
    ],
    persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

const moveCommand = {
  timelineId: 'yd', projectId: 'p1',
  expectedStartDate: '2026-01-01', expectedEndDate: '2026-12-31',
  deltaDays: 10,
  expectedMilestones: [{ id: 'm1', date: '2026-03-08' }, { id: 'm2', date: '2026-04-10' }],
} as const;

describe('ProjectTimeline application commands', () => {
  it('atomically moves the range and every owned Milestone by one delta', () => {
    const graph = graphFixture();
    const otherBefore = structuredClone(graph.milestones[2]);
    const candidate = moveProjectTimeline(moveCommand)(graph);
    expect(candidate.projectTimelines[0]).toMatchObject({ startDate: '2026-01-11', endDate: '2027-01-10' });
    expect(candidate.projects[0]).toMatchObject({ startDate: '2026-01-11', endDate: '2027-01-10' });
    expect(candidate.milestones[0]).toMatchObject({ date: '2026-03-18', status: 'at_risk', projectId: 'p1', timelineId: 'yd' });
    expect(candidate.milestones[1].date).toBe('2026-04-20');
    expect(candidate.milestones[2]).toEqual(otherBefore);
  });

  it('rejects stale Timeline or Milestone snapshots before mutation', () => {
    expect(() => moveProjectTimeline({ ...moveCommand, expectedStartDate: '2025-12-31' })(graphFixture()))
      .toThrow(ProjectTimelineMutationConflictError);
    expect(() => moveProjectTimeline({
      ...moveCommand,
      expectedMilestones: [{ id: 'm1', date: '2026-03-09' }, { id: 'm2', date: '2026-04-10' }],
    })(graphFixture())).toThrow(ProjectTimelineMutationConflictError);
  });

  it('resizes one boundary, mirrors YD Project dates, and never moves Milestones', () => {
    const left = graphFixture();
    const milestoneDates = left.milestones.map((item) => item.date);
    resizeProjectTimeline({
      timelineId: 'yd', projectId: 'p1', expectedStartDate: '2026-01-01',
      expectedEndDate: '2026-12-31', side: 'start', date: '2026-02-01',
    })(left);
    expect(left.projectTimelines[0]).toMatchObject({ startDate: '2026-02-01', endDate: '2026-12-31' });
    expect(left.projects[0]).toMatchObject({ startDate: '2026-02-01', endDate: '2026-12-31' });
    expect(left.milestones.map((item) => item.date)).toEqual(milestoneDates);

    const sameDay = graphFixture();
    resizeProjectTimeline({
      timelineId: 'yd', projectId: 'p1', expectedStartDate: '2026-01-01',
      expectedEndDate: '2026-12-31', side: 'start', date: '2026-12-31',
    })(sameDay);
    expect(sameDay.projectTimelines[0].startDate).toBe(sameDay.projectTimelines[0].endDate);
  });

  it('keeps external Timeline edits independent from Project primary dates', () => {
    const graph = graphFixture();
    resizeProjectTimeline({
      timelineId: 'oem', projectId: 'p1', expectedStartDate: '2026-02-01',
      expectedEndDate: '2026-10-31', side: 'end', date: '2026-11-30',
    })(graph);
    expect(graph.projectTimelines[1].endDate).toBe('2026-11-30');
    expect(graph.projects[0]).toMatchObject({ startDate: '2026-01-01', endDate: '2026-12-31' });
  });

  it('saves one atomic candidate and rolls every entity back on repository failure', async () => {
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => graphFixture()),
      save: vi.fn(async () => undefined),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();
    await store.commitGraph(moveProjectTimeline(moveCommand));
    expect(repository.save).toHaveBeenCalledOnce();
    expect(store.getState().graph.milestones.map((item) => item.date)).toEqual([
      '2026-03-18', '2026-04-20', '2026-05-01',
    ]);

    const beforeFailure = store.getState().graph;
    vi.mocked(repository.save).mockRejectedValueOnce(new Error('save failed'));
    await expect(store.commitGraph(moveProjectTimeline({
      ...moveCommand,
      expectedStartDate: '2026-01-11', expectedEndDate: '2027-01-10',
      expectedMilestones: [{ id: 'm1', date: '2026-03-18' }, { id: 'm2', date: '2026-04-20' }],
    }))).rejects.toThrow('save failed');
    expect(store.getState().graph).toBe(beforeFailure);
  });

  it('rejects a crossing Resize at validation without saving', async () => {
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => graphFixture()),
      save: vi.fn(async () => undefined),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();
    const before = store.getState().graph;
    await expect(store.commitGraph(resizeProjectTimeline({
      timelineId: 'yd', projectId: 'p1', expectedStartDate: '2026-01-01',
      expectedEndDate: '2026-12-31', side: 'start', date: '2027-01-01',
    }))).rejects.toThrow();
    expect(store.getState().graph).toBe(before);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
