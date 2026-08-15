import { describe, expect, it } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import { selectProjectManager, selectProjectManagementDrawerData } from './projectManagementDrawerData';

const graph: ProjectGraph = {
  projects: [{ id: 'p1', name: 'Alpha', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' }],
  projectTimelines: [{ id: 'yd', projectId: 'p1', lane: 'YD', name: 'YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] }],
  milestones: [{ id: 'm1', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'Gate', date: '2026-03-01', code: 'G1' }],
  persons: [{ id: 'active', name: 'Active Manager' }, { id: 'inactive', name: 'Inactive Manager' }],
  projectMemberships: [
    { id: 'p1::inactive', projectId: 'p1', personId: 'inactive', roles: ['project_manager'], status: 'inactive' },
    { id: 'p1::active', projectId: 'p1', personId: 'active', roles: ['project_manager'], status: 'active' },
  ],
  projectTeams: [{ projectId: 'p1' }],
};

describe('Project Management Drawer data adapter', () => {
  it('resolves only Person + active project_manager Membership', () => {
    expect(selectProjectManager(graph, 'p1')?.name).toBe('Active Manager');
    expect(selectProjectManagementDrawerData(graph, { kind: 'project', projectId: 'p1' }))
      .toMatchObject({ kind: 'project', projectManager: { id: 'active' } });
  });

  it('resolves canonical Timeline and Milestone relations without compatibility fields', () => {
    expect(selectProjectManagementDrawerData(graph, { kind: 'timeline', timelineId: 'yd' }))
      .toMatchObject({ kind: 'timeline', project: { id: 'p1' } });
    expect(selectProjectManagementDrawerData(graph, { kind: 'milestone', milestoneId: 'm1' }))
      .toMatchObject({ kind: 'milestone', timeline: { id: 'yd' }, project: { id: 'p1' } });
  });
});
