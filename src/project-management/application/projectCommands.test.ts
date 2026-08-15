import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import { createProjectManagementStore } from '../state/projectManagementStore';
import { ProjectMutationConflictError, updateProject } from './projectCommands';

function graphFixture(): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectCode: 'A', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31', description: 'Before' }],
    projectTimelines: [
      { id: 'yd', projectId: 'p1', lane: 'YD', name: 'YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
      { id: 'oem', projectId: 'p1', lane: 'OEM', name: 'OEM', startDate: '2026-02-01', endDate: '2026-10-01', keyResources: [] },
    ],
    milestones: [], persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

const command = {
  projectId: 'p1',
  expected: { name: 'Alpha', projectCode: 'A', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31', description: 'Before' },
  values: { name: 'Alpha 2', projectCode: 'A2', projectStatus: 'paused', startDate: '2026-02-01', endDate: '2026-11-30', description: 'After' },
} as const;

describe('updateProject application command', () => {
  it('updates Project and its YD date mirror in one candidate without changing external timelines', () => {
    const graph = graphFixture();
    const oem = structuredClone(graph.projectTimelines[1]);
    updateProject(command)(graph);
    expect(graph.projects[0]).toMatchObject(command.values);
    expect(graph.projectTimelines[0]).toMatchObject({ startDate: '2026-02-01', endDate: '2026-11-30' });
    expect(graph.projectTimelines[1]).toEqual(oem);
  });

  it('rejects stale edits and rolls back repository failure', async () => {
    expect(() => updateProject({ ...command, expected: { ...command.expected, name: 'Stale' } })(graphFixture()))
      .toThrow(ProjectMutationConflictError);
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => graphFixture()),
      save: vi.fn(async () => { throw new Error('save failed'); }),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();
    const before = store.getState().graph;
    await expect(store.commitGraph(updateProject(command))).rejects.toThrow('save failed');
    expect(store.getState().graph).toBe(before);
  });
});
