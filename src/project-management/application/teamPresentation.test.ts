import { describe, expect, it } from 'vitest';

import { createEmptyProjectGraph, projectMembershipId, type ProjectGraph, type ProjectRole } from '../domain';
import { membershipRolePresentation, personInitial, resolveProjectManager } from './teamPresentation';

function graph(): ProjectGraph {
  return {
    ...createEmptyProjectGraph(),
    persons: [{ id: 'active', name: 'Alex' }, { id: 'inactive', name: 'Inactive' }],
    projectMemberships: [
      { id: projectMembershipId('p', 'inactive'), projectId: 'p', personId: 'inactive', roles: ['project_manager'], status: 'inactive' },
      { id: projectMembershipId('p', 'active'), projectId: 'p', personId: 'active', roles: ['project_manager'], status: 'active' },
    ],
  };
}

describe('Project Manager and member presentation', () => {
  it('resolves only Person plus active project_manager Membership', () => {
    expect(resolveProjectManager(graph(), 'p')?.person.id).toBe('active');
    const inactive = graph(); inactive.projectMemberships[1].status = 'inactive';
    expect(resolveProjectManager(inactive, 'p')).toBeNull();
  });

  it('fails safe when the Person is missing and never introduces Account fallback', () => {
    const missing = graph(); missing.persons = [];
    expect(resolveProjectManager(missing, 'p')).toBeNull();
    expect(JSON.stringify(resolveProjectManager(missing, 'p'))).not.toContain('account');
  });

  it('uses a deterministic name initial and centralized localized role labels', () => {
    expect(personInitial(' 陈晓')).toBe('陈');
    expect(personInitial('')).toBe('?');
    const labels = Object.fromEntries((['project_manager', 'system_owner', 'software_owner', 'hardware_owner', 'test_owner', 'oem_contact', 'tier1_contact', 'member'] satisfies ProjectRole[]).map((role) => [role, `label:${role}`])) as Record<ProjectRole, string>;
    expect(membershipRolePresentation('project_manager', labels)).toBe('label:project_manager');
  });
});
