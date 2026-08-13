import {
  PROJECT_MEMBERSHIP_STATUSES,
  PROJECT_ROLES,
  type ProjectMembershipStatus,
  type ProjectRole,
} from './types';

const PROJECT_ROLE_SET = new Set<string>(PROJECT_ROLES);
const PROJECT_MEMBERSHIP_STATUS_SET = new Set<string>(PROJECT_MEMBERSHIP_STATUSES);

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === 'string' && PROJECT_ROLE_SET.has(value);
}

export function isProjectMembershipStatus(value: unknown): value is ProjectMembershipStatus {
  return typeof value === 'string' && PROJECT_MEMBERSHIP_STATUS_SET.has(value);
}

/** Canonical role order; specialized roles make the generic member role redundant. */
export function normalizeProjectRoles(roles: readonly ProjectRole[]): ProjectRole[] {
  const selected = new Set<ProjectRole>(roles);
  const normalized = PROJECT_ROLES.filter((role) => selected.has(role));
  return normalized.length > 1 ? normalized.filter((role) => role !== 'member') : normalized;
}

/** Stable identity for one Person's membership in one Project. */
export function projectMembershipId(projectId: string, personId: string): string {
  return `pm:${projectId.length}:${projectId}:${personId.length}:${personId}`;
}
