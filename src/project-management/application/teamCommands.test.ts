import { describe, expect, it, vi } from 'vitest';

import { projectMembershipId, validateProjectGraph, type ProjectGraph } from '../domain';
import type { ProjectManagementRepository } from '../repository';
import { commitProjectGraphMutation } from './projectGraphRuntime';
import {
  addProjectMember, changeProjectMemberRoles, removeProjectMember, setProjectManager,
  ProjectTeamConflictError,
} from './teamCommands';

function graph(): ProjectGraph {
  return {
    projects: [
      { id: 'p1', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' },
      { id: 'p2', name: 'Beta', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' },
    ],
    projectTimelines: [
      { id: 't1', projectId: 'p1', lane: 'YD', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
      { id: 't2', projectId: 'p2', lane: 'YD', name: 'Beta', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
    ],
    milestones: [],
    persons: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Casey' }],
    projectMemberships: [
      { id: projectMembershipId('p1', 'a'), projectId: 'p1', personId: 'a', roles: ['project_manager'], status: 'active' },
      { id: projectMembershipId('p1', 'b'), projectId: 'p1', personId: 'b', roles: ['software_owner'], status: 'active' },
      { id: projectMembershipId('p2', 'b'), projectId: 'p2', personId: 'b', roles: ['member'], status: 'active' },
      { id: projectMembershipId('p1', 'c'), projectId: 'p1', personId: 'c', roles: ['member'], status: 'inactive' },
    ],
    projectTeams: [{ projectId: 'p1' }, { projectId: 'p2' }],
  };
}

describe('Project Team application commands', () => {
  it('adds or reactivates only an existing Person and rejects active duplicates', () => {
    const reactivated = addProjectMember({ projectId: 'p1', personId: 'c' })(graph());
    expect(reactivated.projectMemberships.find((item) => item.personId === 'c')).toMatchObject({ status: 'active', roles: ['member'] });
    expect(() => addProjectMember({ projectId: 'p1', personId: 'b' })(graph())).toThrow(ProjectTeamConflictError);
    expect(() => addProjectMember({ projectId: 'p1', personId: 'missing' })(graph())).toThrow('Person no longer exists');
    expect(() => addProjectMember({ projectId: 'missing', personId: 'c' })(graph())).toThrow('Project no longer exists');
  });

  it('removes Membership without deleting Person or affecting another Project', () => {
    const result = removeProjectMember({ projectId: 'p1', personId: 'b' })(graph());
    expect(result.persons).toHaveLength(3);
    expect(result.projectMemberships.find((item) => item.projectId === 'p1' && item.personId === 'b')?.status).toBe('inactive');
    expect(result.projectMemberships.find((item) => item.projectId === 'p2' && item.personId === 'b')?.status).toBe('active');
    expect(result.projectTeams).toEqual(graph().projectTeams);
  });

  it('allows removing the manager because the formal validator permits an unassigned Project', () => {
    const result = removeProjectMember({ projectId: 'p1', personId: 'a' })(graph());
    expect(validateProjectGraph(result)).toEqual({ valid: true, issues: [] });
    expect(result.projectMemberships.find((item) => item.personId === 'a')?.status).toBe('inactive');
  });

  it('changes legal roles and leaves invalid values to the validated command boundary', () => {
    const result = changeProjectMemberRoles({ projectId: 'p1', personId: 'b', roles: ['test_owner'] })(graph());
    expect(result.projectMemberships.find((item) => item.personId === 'b' && item.projectId === 'p1')?.roles).toEqual(['test_owner']);
    expect(() => changeProjectMemberRoles({ projectId: 'p1', personId: 'b', roles: [] })(graph())).toThrow(ProjectTeamConflictError);
    expect(() => changeProjectMemberRoles({ projectId: 'p1', personId: 'b', roles: ['invalid' as never] })(graph())).toThrow(ProjectTeamConflictError);
  });

  it('replaces the manager in one valid candidate and requires active Membership', () => {
    const result = setProjectManager({ projectId: 'p1', personId: 'b' })(graph());
    expect(result.projectMemberships.find((item) => item.personId === 'a')?.roles).toEqual(['member']);
    expect(result.projectMemberships.find((item) => item.personId === 'b' && item.projectId === 'p1')?.roles).toEqual(['project_manager', 'software_owner']);
    expect(validateProjectGraph(result)).toEqual({ valid: true, issues: [] });
    expect(() => setProjectManager({ projectId: 'p1', personId: 'c' })(graph())).toThrow('active Project member');
  });

  it('saves once, commits only after save, and rolls back on repository failure', async () => {
    const source = graph();
    const save = vi.fn<(candidate: ProjectGraph) => Promise<void>>().mockResolvedValue();
    const repository: ProjectManagementRepository = { load: vi.fn(), save };
    const result = await commitProjectGraphMutation(repository, source, setProjectManager({ projectId: 'p1', personId: 'b' }));
    expect(save).toHaveBeenCalledOnce();
    expect(source.projectMemberships.find((item) => item.personId === 'a')?.roles).toEqual(['project_manager']);
    expect(result.projectMemberships.find((item) => item.personId === 'b' && item.projectId === 'p1')?.roles).toContain('project_manager');

    const failedSave = vi.fn().mockRejectedValue(new Error('disk failed'));
    await expect(commitProjectGraphMutation({ load: vi.fn(), save: failedSave }, source, removeProjectMember({ projectId: 'p1', personId: 'a' }))).rejects.toThrow('disk failed');
    expect(source.projectMemberships.find((item) => item.personId === 'a')?.status).toBe('active');
  });
});
