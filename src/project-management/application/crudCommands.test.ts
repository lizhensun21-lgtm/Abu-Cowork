import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { validateProjectGraph } from '../domain/projectGraph';
import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import {
  createMilestone,
  createProject,
  createProjectTimeline,
  deleteMilestone,
  deleteProject,
  deleteProjectTimeline,
  ProjectManagementCrudConflictError,
  type ProjectManagementIdFactory,
} from './crudCommands';
import { commitProjectGraphMutation } from './projectGraphRuntime';

function graph(): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' }],
    projectTimelines: [
      { id: 't-yd', projectId: 'p1', lane: 'YD', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
      { id: 't-oem', projectId: 'p1', lane: 'OEM', name: 'OEM', startDate: '2026-02-01', endDate: '2026-10-01', keyResources: [] },
    ],
    milestones: [
      { id: 'm-yd', projectId: 'p1', timelineId: 't-yd', lane: 'YD', title: 'G0', date: '2026-01-02', code: 'G0' },
      { id: 'm-oem', projectId: 'p1', timelineId: 't-oem', lane: 'OEM', title: 'OEM gate', date: '2027-01-02', code: '', status: 'not_started' },
    ],
    persons: [{ id: 'person-1', name: 'Owner' }],
    projectMemberships: [{ id: 'pm:2:p1:8:person-1', projectId: 'p1', personId: 'person-1', roles: ['member'], status: 'active' }],
    projectTeams: [{ projectId: 'p1', externalProjectManager: 'External' }],
  };
}

function ids(...values: string[]): ProjectManagementIdFactory {
  let index = 0;
  return () => values[index++] ?? `generated-${index}`;
}

describe('project management CRUD commands', () => {
  it('creates Project, derived Timelines, Milestones, Team, and Memberships in one candidate', () => {
    const source = graph();
    const mutation = createProject({
      name: 'Beta', projectCode: 'B-01', startDate: '2026-03-01', endDate: '2026-09-30',
      projectStatus: 'planning', lifecyclePhase: 'concept', summary: 'Launch', priority: 'high',
      customer: 'Customer', vehicleModel: 'X1', projectType: 'development',
      projectManagerId: 'person-1',
      initialMembers: [{ personId: 'person-1', roles: ['system_owner'] }],
      initialMilestones: [
        { lane: 'YD', title: 'Kickoff', date: '2026-03-01', code: 'G0' },
        { lane: 'Tier1', title: 'Supplier gate', date: '2026-04-01', code: '', note: 'Review' },
      ],
    }, ids('p2', 't2-yd', 't2-tier1', 'm2', 'm3'));
    const candidate = mutation(structuredClone(source));
    expect(source.projects).toHaveLength(1);
    expect(candidate.projects.find((item) => item.id === 'p2')).toMatchObject({
      name: 'Beta', lifecyclePhase: 'concept', summary: 'Launch', priority: 'high',
      customer: 'Customer', vehicleModel: 'X1', projectType: 'development',
    });
    expect(candidate.projectTimelines.filter((item) => item.projectId === 'p2')).toEqual([
      expect.objectContaining({ id: 't2-yd', lane: 'YD', startDate: '2026-03-01', endDate: '2026-09-30' }),
      expect.objectContaining({ id: 't2-tier1', lane: 'Tier1' }),
    ]);
    expect(candidate.milestones.filter((item) => item.projectId === 'p2')).toEqual([
      expect.objectContaining({ id: 'm2', timelineId: 't2-yd', lane: 'YD', title: 'Kickoff' }),
      expect.objectContaining({ id: 'm3', timelineId: 't2-tier1', lane: 'Tier1', title: 'Supplier gate', note: 'Review' }),
    ]);
    expect(candidate.projectMemberships.at(-1)).toMatchObject({
      projectId: 'p2', personId: 'person-1', roles: ['project_manager', 'system_owner'], status: 'active',
    });
    expect(candidate.projectMemberships.filter((item) => item.projectId === 'p2')).toHaveLength(1);
    expect(candidate.projectTeams.at(-1)).toEqual({ projectId: 'p2' });
    expect(validateProjectGraph(candidate).valid).toBe(true);
  });

  it('does not create optional Timelines without a matching initial Milestone', () => {
    const candidate = createProject({
      name: 'No plan yet', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      initialMilestones: [], initialMembers: [],
    }, ids('p2', 't2-yd'))(graph());
    expect(candidate.projectTimelines.filter((item) => item.projectId === 'p2').map((item) => item.lane)).toEqual(['YD']);
    expect(candidate.projectTeams.at(-1)).toEqual({ projectId: 'p2' });
  });

  it('rejects Create drafts that reference a non-existent Person', () => {
    expect(() => createProject({
      name: 'Bad team', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      projectManagerId: 'missing-person',
    }, ids('p2', 't2-yd'))(graph())).toThrow('existing Person');
  });

  it('creates one active regular-member Membership when no specialized role is selected', () => {
    const candidate = createProject({
      name: 'Regular team', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      initialMembers: [{ personId: 'person-1', roles: [] }],
    }, ids('p2', 't2-yd'))(graph());
    expect(candidate.projectMemberships.filter((item) => item.projectId === 'p2')).toEqual([
      expect.objectContaining({ personId: 'person-1', roles: ['member'], status: 'active' }),
    ]);
  });

  it('merges duplicate Person drafts into one Membership and reserves PM selection for one field', () => {
    const candidate = createProject({
      name: 'Merged team', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      projectManagerId: 'person-1',
      initialMembers: [
        { personId: 'person-1', roles: ['software_owner'] },
        { personId: 'person-1', roles: ['test_owner'] },
      ],
    }, ids('p2', 't2-yd'))(graph());
    expect(candidate.projectMemberships.filter((item) => item.projectId === 'p2')).toEqual([
      expect.objectContaining({
        personId: 'person-1', roles: ['project_manager', 'software_owner', 'test_owner'], status: 'active',
      }),
    ]);
    expect(validateProjectGraph(candidate).valid).toBe(true);

    expect(() => createProject({
      name: 'Invalid managers', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      initialMembers: [{ personId: 'person-1', roles: ['project_manager'] }],
    }, ids('p3', 't3-yd'))(graph())).toThrow('projectManagerId');
  });

  it('prohibits duplicate lanes and a second YD through the command surface', () => {
    expect(() => createProjectTimeline({ projectId: 'p1', lane: 'OEM', name: 'Other', startDate: '2026-01-01', endDate: '2026-02-01' })(graph()))
      .toThrow(ProjectManagementCrudConflictError);
    expectTypeOf<Parameters<typeof createProjectTimeline>[0]['lane']>().toEqualTypeOf<'OEM' | 'Tier1'>();
  });

  it('creates an external Timeline and a related Milestone without clamping its date', () => {
    const withTier1 = createProjectTimeline({ projectId: 'p1', lane: 'Tier1', name: 'Supplier', startDate: '2026-04-01', endDate: '2026-06-01' }, ids('t-tier1'))(graph());
    const result = createMilestone({ projectId: 'p1', timelineId: 't-tier1', title: 'Late gate', date: '2027-02-03', code: '', status: 'at_risk' }, ids('m-tier1'))(withTier1);
    expect(result.milestones.at(-1)).toMatchObject({ id: 'm-tier1', lane: 'Tier1', date: '2027-02-03' });
    expect(validateProjectGraph(result).valid).toBe(true);
    expect(() => createMilestone({ projectId: 'missing', timelineId: 't-tier1', title: 'Bad', date: '2026-01-01', code: '' })(result))
      .toThrow(ProjectManagementCrudConflictError);
  });

  it('deletes one Milestone and cascades Timeline children while protecting YD', () => {
    const milestoneDeleted = deleteMilestone({ milestoneId: 'm-yd', projectId: 'p1', timelineId: 't-yd' })(graph());
    expect(milestoneDeleted.milestones.map((item) => item.id)).toEqual(['m-oem']);
    const timelineDeleted = deleteProjectTimeline({ timelineId: 't-oem', projectId: 'p1' })(graph());
    expect(timelineDeleted.projectTimelines.map((item) => item.id)).toEqual(['t-yd']);
    expect(timelineDeleted.milestones.map((item) => item.id)).toEqual(['m-yd']);
    expect(() => deleteProjectTimeline({ timelineId: 't-yd', projectId: 'p1' })(graph()))
      .toThrow('mandatory YD');
  });

  it('deletes the complete Project aggregate but preserves people and other aggregates', () => {
    const source = graph();
    source.projects.push({ id: 'p2', name: 'Beta', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' });
    source.projectTimelines.push({ id: 't2', projectId: 'p2', lane: 'YD', name: 'Beta', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] });
    source.projectMemberships.push({ id: 'pm:2:p2:8:person-1', projectId: 'p2', personId: 'person-1', roles: ['member'], status: 'active' });
    source.projectTeams.push({ projectId: 'p2' });
    const result = deleteProject({ projectId: 'p1' })(source);
    expect(result.projects.map((item) => item.id)).toEqual(['p2']);
    expect(result.projectTimelines.map((item) => item.id)).toEqual(['t2']);
    expect(result.milestones).toEqual([]);
    expect(result.projectMemberships).toEqual([expect.objectContaining({ projectId: 'p2', personId: 'person-1' })]);
    expect(result.projectTeams).toEqual([{ projectId: 'p2' }]);
    expect(result.persons).toEqual([{ id: 'person-1', name: 'Owner' }]);
    expect(validateProjectGraph(result).valid).toBe(true);
  });

  it('saves once and leaves runtime state unchanged on validation or repository failure', async () => {
    const source = graph();
    const save = vi.fn<(candidate: ProjectGraph) => Promise<void>>().mockResolvedValue();
    const repository: ProjectManagementRepository = { load: vi.fn(), save };
    const result = await commitProjectGraphMutation(repository, source, createProject({
      name: 'Beta', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      projectManagerId: 'person-1', initialMembers: [{ personId: 'person-1', roles: [] }],
    }, ids('p2', 't2')));
    expect(save).toHaveBeenCalledOnce();
    expect(source.projects).toHaveLength(1);
    expect(source.projectMemberships).toHaveLength(1);
    expect(result.projects).toHaveLength(2);
    expect(result.projectMemberships.filter((item) => item.projectId === 'p2')).toEqual([
      expect.objectContaining({ personId: 'person-1', roles: ['project_manager'], status: 'active' }),
    ]);

    await expect(commitProjectGraphMutation(repository, source, createProject({
      name: '', startDate: '2026-09-30', endDate: '2026-03-01', projectStatus: 'planning',
    }, ids('p3', 't3')))).rejects.toThrow();
    expect(save).toHaveBeenCalledOnce();
    const failingRepository: ProjectManagementRepository = { load: vi.fn(), save: vi.fn().mockRejectedValue(new Error('disk')) };
    await expect(commitProjectGraphMutation(failingRepository, source, createProject({
      name: 'Rollback team', startDate: '2026-03-01', endDate: '2026-09-30', projectStatus: 'planning',
      projectManagerId: 'person-1', initialMembers: [{ personId: 'person-1', roles: ['software_owner'] }],
    }, ids('p4', 't4')))).rejects.toThrow('disk');
    expect(source.projects).toHaveLength(1);
    expect(source.projectMemberships).toHaveLength(1);
  });
});
