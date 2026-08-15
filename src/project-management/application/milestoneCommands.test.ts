import { describe, expect, it, vi } from 'vitest';

import { createProjectManagementStore } from '../state/projectManagementStore';
import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import { MilestoneMutationConflictError, moveMilestone, updateMilestone } from './milestoneCommands';

function graphFixture(): ProjectGraph {
  return {
    projects: [{
      id: 'p1', name: 'Alpha', projectStatus: 'active',
      startDate: '2026-01-01', endDate: '2026-12-31',
    }],
    projectTimelines: [{
      id: 't1', projectId: 'p1', lane: 'YD', name: 'YD',
      startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [],
    }],
    milestones: [
      {
        id: 'm1', projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'Gate',
        date: '2026-03-08', code: 'G1', status: 'at_risk', note: 'Keep me',
      },
      {
        id: 'm2', projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'Other',
        date: '2026-04-01', code: 'G2', status: 'completed',
      },
    ],
    persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

const command = {
  milestoneId: 'm1', projectId: 'p1', timelineId: 't1',
  expectedDate: '2026-03-08', date: '2026-03-09',
} as const;

describe('moveMilestone application command', () => {
  it('changes only the target date and preserves relationships, status, and peers', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    const candidate = moveMilestone(command)(graph);

    expect(candidate.milestones[0]).toEqual({ ...before.milestones[0], date: '2026-03-09' });
    expect(candidate.milestones[1]).toEqual(before.milestones[1]);
    expect(candidate.projects).toEqual(before.projects);
    expect(candidate.projectTimelines).toEqual(before.projectTimelines);
  });

  it('rejects stale identity and date expectations instead of overwriting newer data', () => {
    expect(() => moveMilestone({ ...command, projectId: 'other' })(graphFixture()))
      .toThrow(MilestoneMutationConflictError);
    expect(() => moveMilestone({ ...command, expectedDate: '2026-03-07' })(graphFixture()))
      .toThrow(MilestoneMutationConflictError);
  });

  it('updates Drawer fields while retaining I5 date and readonly relationship semantics', () => {
    const graph = graphFixture();
    updateMilestone({
      milestoneId: 'm1', projectId: 'p1', timelineId: 't1', expected: graph.milestones[0],
      values: { title: 'Updated', date: '2026-03-10', code: 'G2', status: 'blocked', note: 'After' },
    })(graph);
    expect(graph.milestones[0]).toMatchObject({
      projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'Updated', date: '2026-03-10',
      code: 'G2', status: 'blocked', note: 'After',
    });
    expect(graph.milestones[0].status).not.toBe('current_focus');
  });

  it('commits only after save and rolls back on validation or repository failure', async () => {
    const saved: ProjectGraph[] = [];
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => graphFixture()),
      save: vi.fn(async (graph) => { saved.push(structuredClone(graph)); }),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();
    await store.commitGraph(moveMilestone(command));
    expect(saved[0].milestones[0].date).toBe('2026-03-09');
    expect(store.getState().graph.milestones[0].date).toBe('2026-03-09');

    const beforeInvalid = store.getState().graph;
    await expect(store.commitGraph(moveMilestone({
      ...command, expectedDate: '2026-03-09', date: 'not-a-date',
    }))).rejects.toThrow();
    expect(store.getState().graph).toBe(beforeInvalid);
    expect(repository.save).toHaveBeenCalledTimes(1);

    vi.mocked(repository.save).mockRejectedValueOnce(new Error('save failed'));
    await expect(store.commitGraph(moveMilestone({
      ...command, expectedDate: '2026-03-09', date: '2026-03-10',
    }))).rejects.toThrow('save failed');
    expect(store.getState().graph).toBe(beforeInvalid);
  });
});
