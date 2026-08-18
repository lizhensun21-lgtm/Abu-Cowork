import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import { selectMemberRows } from './portalProjections';
import { commitProjectGraphMutation } from './projectGraphRuntime';
import { resolveProjectManager } from './teamPresentation';
import {
  createPerson,
  deletePerson,
  updatePerson,
} from './personCommands';

function emptyGraph(): ProjectGraph {
  return {
    projects: [], projectTimelines: [], milestones: [], persons: [],
    projectMemberships: [], projectTeams: [],
  };
}

function projectGraph(): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' }],
    projectTimelines: [{ id: 't1', projectId: 'p1', lane: 'YD', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] }],
    milestones: [],
    persons: [{ id: 'person-1', name: 'Alex', title: 'Lead' }],
    projectMemberships: [],
    projectTeams: [{ projectId: 'p1' }],
  };
}

describe('Person application commands', () => {
  it('starts with an empty Person pool and creates only formal Person fields with the shared ID factory', () => {
    const source = emptyGraph();
    const candidate = createPerson({ name: '  Morgan  ', title: '  Program Lead  ' }, (kind) => `${kind}-1`)(structuredClone(source));
    expect(source.persons).toEqual([]);
    expect(candidate.persons).toEqual([{ id: 'person-1', name: '  Morgan  ', title: '  Program Lead  ' }]);
    expect(Object.keys(candidate.persons[0]).sort()).toEqual(['id', 'name', 'title']);
  });

  it('edits the shared Person entity so Members and PM presentations update from one graph', () => {
    const source = projectGraph();
    source.projectMemberships.push({
      id: 'pm:2:p1:8:person-1', projectId: 'p1', personId: 'person-1',
      roles: ['project_manager'], status: 'active',
    });
    const candidate = updatePerson({
      personId: 'person-1',
      expected: { name: 'Alex', title: 'Lead' },
      values: { name: 'Alex Chen', title: 'Program Director' },
    })(structuredClone(source));
    expect(selectMemberRows(candidate)[0]).toMatchObject({ name: 'Alex Chen', title: 'Program Director' });
    expect(resolveProjectManager(candidate, 'p1')?.person).toMatchObject({ name: 'Alex Chen', title: 'Program Director' });
  });

  it('rejects stale edits without mutating the Person', () => {
    const source = projectGraph();
    expect(() => updatePerson({
      personId: 'person-1', expected: { name: 'Old name', title: 'Lead' },
      values: { name: 'New name', title: 'Lead' },
    })(source)).toThrow('changed before commit');
    expect(source.persons[0].name).toBe('Alex');
  });

  it('deletes an unused Person without deleting a Project', () => {
    const candidate = deletePerson({ personId: 'person-1' })(projectGraph());
    expect(candidate.persons).toEqual([]);
    expect(candidate.projects).toHaveLength(1);
  });

  it('blocks deletion for active and historical Membership references without cleanup', () => {
    for (const status of ['active', 'inactive'] as const) {
      const source = projectGraph();
      source.projectMemberships.push({
        id: 'pm:2:p1:8:person-1', projectId: 'p1', personId: 'person-1',
        roles: ['member'], status,
      });
      expect(() => deletePerson({ personId: 'person-1' })(source)).toThrow(
        status === 'active' ? 'Remove the member' : 'historical',
      );
      expect(source.persons).toHaveLength(1);
      expect(source.projectMemberships).toHaveLength(1);
    }
  });

  it('normalizes, validates, saves once, and returns one committed graph', async () => {
    const save = vi.fn(async () => undefined);
    const repository: ProjectManagementRepository = { load: vi.fn(), save };
    const committed = await commitProjectGraphMutation(
      repository,
      emptyGraph(),
      createPerson({ name: '  Morgan  ', title: '  Lead  ' }, () => 'person-1'),
    );
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(committed);
    expect(committed.persons).toEqual([{ id: 'person-1', name: 'Morgan', title: 'Lead' }]);
  });

  it('rolls back the complete runtime result when repository save fails', async () => {
    const source = emptyGraph();
    const repository: ProjectManagementRepository = {
      load: vi.fn(), save: vi.fn(async () => { throw new Error('save failed'); }),
    };
    await expect(commitProjectGraphMutation(
      repository,
      source,
      createPerson({ name: 'Morgan' }, () => 'person-1'),
    )).rejects.toThrow('save failed');
    expect(source.persons).toEqual([]);
  });
});
