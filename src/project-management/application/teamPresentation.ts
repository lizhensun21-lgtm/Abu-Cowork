import type { Person, ProjectGraph, ProjectMembership, ProjectRole } from '../domain/types';

export interface ProjectManagerResolution {
  readonly person: Readonly<Person>;
  readonly membership: Readonly<ProjectMembership>;
}

export function resolveProjectManager(
  graph: Readonly<ProjectGraph>,
  projectId: string,
): ProjectManagerResolution | null {
  const membership = graph.projectMemberships.find((item) => (
    item.projectId === projectId
    && item.status === 'active'
    && item.roles.includes('project_manager')
  ));
  if (!membership) return null;
  const person = graph.persons.find((item) => item.id === membership.personId);
  return person ? { person, membership } : null;
}

export function personInitial(name: string): string {
  return Array.from(name.trim()).slice(0, 1).join('').toLocaleUpperCase() || '?';
}

export function membershipRolePresentation(
  role: ProjectRole,
  labels: Readonly<Record<ProjectRole, string>>,
): string {
  return labels[role];
}
