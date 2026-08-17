import {
  isProjectRole,
  normalizeProjectRoles,
  projectMembershipId,
} from '../domain/projectMembership';
import type { ProjectGraph, ProjectRole } from '../domain/types';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export class ProjectTeamConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectTeamConflictError';
  }
}

function requireProjectAndPerson(draft: ProjectGraph, projectId: string, personId: string) {
  if (!draft.projects.some((project) => project.id === projectId)) {
    throw new ProjectTeamConflictError(`Project no longer exists: ${projectId}`);
  }
  if (!draft.persons.some((person) => person.id === personId)) {
    throw new ProjectTeamConflictError(`Person no longer exists: ${personId}`);
  }
}

function requireRoles(roles: readonly ProjectRole[]): ProjectRole[] {
  if (!roles.length || roles.some((role) => !isProjectRole(role))) {
    throw new ProjectTeamConflictError('Membership requires at least one valid project role');
  }
  return normalizeProjectRoles(roles);
}

export interface AddProjectMemberCommand {
  readonly projectId: string;
  readonly personId: string;
  readonly roles?: readonly ProjectRole[];
}

/** Adds a Person from the formal pool, or reactivates their existing Membership. */
export function addProjectMember(command: AddProjectMemberCommand): ProjectGraphMutation {
  return (draft) => {
    requireProjectAndPerson(draft, command.projectId, command.personId);
    const existing = draft.projectMemberships.find((membership) => (
      membership.projectId === command.projectId && membership.personId === command.personId
    ));
    if (existing?.status === 'active') {
      throw new ProjectTeamConflictError('Person is already an active member of this Project');
    }
    const roles = requireRoles(command.roles ?? ['member']);
    if (existing) {
      existing.roles = roles;
      existing.status = 'active';
      delete existing.leftAt;
    } else {
      draft.projectMemberships.push({
        id: projectMembershipId(command.projectId, command.personId),
        projectId: command.projectId,
        personId: command.personId,
        roles,
        status: 'active',
      });
    }
    return draft;
  };
}

export interface RemoveProjectMemberCommand {
  readonly projectId: string;
  readonly personId: string;
}

/** Deactivates only the Project relationship; the global Person remains intact. */
export function removeProjectMember(command: RemoveProjectMemberCommand): ProjectGraphMutation {
  return (draft) => {
    requireProjectAndPerson(draft, command.projectId, command.personId);
    const membership = draft.projectMemberships.find((item) => (
      item.projectId === command.projectId
      && item.personId === command.personId
      && item.status === 'active'
    ));
    if (!membership) throw new ProjectTeamConflictError('Active Project Membership no longer exists');
    membership.status = 'inactive';
    return draft;
  };
}

export interface ChangeProjectMemberRolesCommand {
  readonly projectId: string;
  readonly personId: string;
  readonly roles: readonly ProjectRole[];
}

export function changeProjectMemberRoles(command: ChangeProjectMemberRolesCommand): ProjectGraphMutation {
  return (draft) => {
    requireProjectAndPerson(draft, command.projectId, command.personId);
    const membership = draft.projectMemberships.find((item) => (
      item.projectId === command.projectId
      && item.personId === command.personId
      && item.status === 'active'
    ));
    if (!membership) throw new ProjectTeamConflictError('Active Project Membership no longer exists');
    membership.roles = requireRoles(command.roles);
    return draft;
  };
}

export interface SetProjectManagerCommand {
  readonly projectId: string;
  readonly personId: string;
}

/** Replaces the active Project Manager in one graph mutation and therefore one save. */
export function setProjectManager(command: SetProjectManagerCommand): ProjectGraphMutation {
  return (draft) => {
    requireProjectAndPerson(draft, command.projectId, command.personId);
    const target = draft.projectMemberships.find((membership) => (
      membership.projectId === command.projectId
      && membership.personId === command.personId
      && membership.status === 'active'
    ));
    if (!target) {
      throw new ProjectTeamConflictError('Project Manager must be an active Project member');
    }
    for (const membership of draft.projectMemberships) {
      if (
        membership.projectId !== command.projectId
        || membership.status !== 'active'
        || !membership.roles.includes('project_manager')
      ) continue;
      const remaining = membership.roles.filter((role) => role !== 'project_manager');
      membership.roles = normalizeProjectRoles(remaining.length ? remaining : ['member']);
    }
    target.roles = normalizeProjectRoles([
      'project_manager',
      ...target.roles.filter((role) => role !== 'member' && role !== 'project_manager'),
    ]);
    return draft;
  };
}
