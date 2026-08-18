import type {
  LifecyclePhase,
  MilestoneCode,
  MilestoneStatus,
  Project,
  ProjectGraph,
  ProjectRole,
  ProjectStatus,
  ProjectType,
  TimelineLane,
} from '../domain/types';
import {
  isProjectRole,
  normalizeProjectRoles,
  projectMembershipId,
} from '../domain/projectMembership';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export type ProjectManagementIdKind = 'project' | 'timeline' | 'milestone' | 'person';
export type ProjectManagementIdFactory = (kind: ProjectManagementIdKind) => string;

export const defaultProjectManagementIdFactory: ProjectManagementIdFactory = (kind) => (
  `${kind}-${globalThis.crypto.randomUUID()}`
);

export class ProjectManagementCrudConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectManagementCrudConflictError';
  }
}

export function allocateProjectManagementId(
  kind: ProjectManagementIdKind,
  existingIds: ReadonlySet<string>,
  idFactory: ProjectManagementIdFactory,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = idFactory(kind).trim();
    if (id && !existingIds.has(id)) return id;
  }
  throw new ProjectManagementCrudConflictError(`Unable to allocate a unique ${kind} ID`);
}

export interface CreateMilestoneValues {
  readonly title: string;
  readonly date: string;
  readonly code: MilestoneCode | '';
  readonly status?: MilestoneStatus;
  readonly note?: string;
}

export interface CreateProjectCommand {
  readonly name: string;
  readonly projectCode?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly projectStatus: ProjectStatus;
  readonly lifecyclePhase?: LifecyclePhase;
  readonly summary?: string;
  readonly description?: string;
  readonly priority?: string;
  readonly customer?: string;
  readonly vehicleModel?: string;
  readonly projectType?: ProjectType;
  readonly projectManagerId?: string;
  readonly initialMembers?: readonly {
    readonly personId: string;
    readonly roles: readonly ProjectRole[];
  }[];
  readonly initialMilestones?: readonly (CreateMilestoneValues & { readonly lane: TimelineLane })[];
}

/** Creates the complete Project aggregate in one candidate graph mutation. */
export function createProject(
  command: CreateProjectCommand,
  idFactory: ProjectManagementIdFactory = defaultProjectManagementIdFactory,
): ProjectGraphMutation {
  return (draft) => {
    const projectIds = new Set(draft.projects.map((item) => item.id));
    const timelineIds = new Set(draft.projectTimelines.map((item) => item.id));
    const milestoneIds = new Set(draft.milestones.map((item) => item.id));
    const projectId = allocateProjectManagementId('project', projectIds, idFactory);
    const project: Project = {
      id: projectId,
      name: command.name,
      projectCode: command.projectCode,
      startDate: command.startDate,
      endDate: command.endDate,
      projectStatus: command.projectStatus,
      lifecyclePhase: command.lifecyclePhase,
      summary: command.summary,
      description: command.description,
      priority: command.priority,
      customer: command.customer,
      vehicleModel: command.vehicleModel,
      projectType: command.projectType,
    };
    draft.projects.push(project);

    const requestedMilestoneLanes = new Set(
      (command.initialMilestones ?? []).map((milestone) => milestone.lane),
    );
    const lanes: TimelineLane[] = [
      'YD',
      ...(['OEM', 'Tier1'] as const).filter((lane) => requestedMilestoneLanes.has(lane)),
    ];
    const timelineByLane = new Map<TimelineLane, string>();
    for (const lane of lanes) {
      const timelineId = allocateProjectManagementId('timeline', timelineIds, idFactory);
      timelineIds.add(timelineId);
      timelineByLane.set(lane, timelineId);
      draft.projectTimelines.push({
        id: timelineId,
        projectId,
        lane,
        name: lane === 'YD' ? command.name : `${command.name} ${lane}`,
        startDate: command.startDate,
        endDate: command.endDate,
        keyResources: [],
      });
    }

    for (const milestone of command.initialMilestones ?? []) {
      const { lane, ...values } = milestone;
      const timelineId = timelineByLane.get(lane);
      if (!timelineId) {
        throw new ProjectManagementCrudConflictError(`Initial ${lane} Timeline does not exist`);
      }
      const id = allocateProjectManagementId('milestone', milestoneIds, idFactory);
      milestoneIds.add(id);
      draft.milestones.push({ id, projectId, timelineId, lane, ...values });
    }

    const personIds = new Set(draft.persons.map((person) => person.id));
    const rolesByPersonId = new Map<string, ProjectRole[]>();
    for (const member of command.initialMembers ?? []) {
      if (!personIds.has(member.personId)) {
        throw new ProjectManagementCrudConflictError('Initial member must reference an existing Person');
      }
      if (member.roles.some((role) => !isProjectRole(role))) {
        throw new ProjectManagementCrudConflictError('Initial member has an invalid Project role');
      }
      if (member.roles.includes('project_manager')) {
        throw new ProjectManagementCrudConflictError(
          'Project Manager must be selected through projectManagerId',
        );
      }
      const memberRoles: readonly ProjectRole[] = member.roles.length ? member.roles : ['member'];
      rolesByPersonId.set(
        member.personId,
        normalizeProjectRoles([
          ...(rolesByPersonId.get(member.personId) ?? []),
          ...memberRoles,
        ]),
      );
    }
    if (command.projectManagerId) {
      if (!personIds.has(command.projectManagerId)) {
        throw new ProjectManagementCrudConflictError('Project Manager must reference an existing Person');
      }
      rolesByPersonId.set(command.projectManagerId, normalizeProjectRoles([
        'project_manager',
        ...(rolesByPersonId.get(command.projectManagerId) ?? []),
      ]));
    }
    draft.projectTeams.push({ projectId });
    for (const [personId, roles] of rolesByPersonId) {
      draft.projectMemberships.push({
        id: projectMembershipId(projectId, personId),
        projectId,
        personId,
        roles,
        status: 'active',
      });
    }
    return draft;
  };
}

export interface CreateProjectTimelineCommand {
  readonly projectId: string;
  readonly lane: Exclude<TimelineLane, 'YD'>;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly keyResources?: readonly string[];
}

export function createProjectTimeline(
  command: CreateProjectTimelineCommand,
  idFactory: ProjectManagementIdFactory = defaultProjectManagementIdFactory,
): ProjectGraphMutation {
  return (draft) => {
    if (!draft.projects.some((item) => item.id === command.projectId)) {
      throw new ProjectManagementCrudConflictError(`Project no longer exists: ${command.projectId}`);
    }
    if (draft.projectTimelines.some((item) => item.projectId === command.projectId && item.lane === command.lane)) {
      throw new ProjectManagementCrudConflictError(`Project already has a ${command.lane} Timeline`);
    }
    const id = allocateProjectManagementId('timeline', new Set(draft.projectTimelines.map((item) => item.id)), idFactory);
    draft.projectTimelines.push({ ...command, id, keyResources: [...(command.keyResources ?? [])] });
    return draft;
  };
}

export interface CreateMilestoneCommand extends CreateMilestoneValues {
  readonly projectId: string;
  readonly timelineId: string;
}

export function createMilestone(
  command: CreateMilestoneCommand,
  idFactory: ProjectManagementIdFactory = defaultProjectManagementIdFactory,
): ProjectGraphMutation {
  return (draft) => {
    const timeline = draft.projectTimelines.find((item) => item.id === command.timelineId);
    if (!timeline || timeline.projectId !== command.projectId) {
      throw new ProjectManagementCrudConflictError('Milestone Project/Timeline relationship is invalid');
    }
    const id = allocateProjectManagementId('milestone', new Set(draft.milestones.map((item) => item.id)), idFactory);
    draft.milestones.push({ ...command, id, lane: timeline.lane });
    return draft;
  };
}

export interface DeleteMilestoneCommand {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly timelineId: string;
}

export function deleteMilestone(command: DeleteMilestoneCommand): ProjectGraphMutation {
  return (draft) => {
    const milestone = draft.milestones.find((item) => item.id === command.milestoneId);
    if (!milestone || milestone.projectId !== command.projectId || milestone.timelineId !== command.timelineId) {
      throw new ProjectManagementCrudConflictError('Milestone no longer exists or its relationship changed');
    }
    draft.milestones = draft.milestones.filter((item) => item.id !== command.milestoneId);
    return draft;
  };
}

export interface DeleteProjectTimelineCommand {
  readonly timelineId: string;
  readonly projectId: string;
}

export function deleteProjectTimeline(command: DeleteProjectTimelineCommand): ProjectGraphMutation {
  return (draft) => {
    const timeline = draft.projectTimelines.find((item) => item.id === command.timelineId);
    if (!timeline || timeline.projectId !== command.projectId) {
      throw new ProjectManagementCrudConflictError('Timeline no longer exists or its Project changed');
    }
    if (timeline.lane === 'YD') {
      throw new ProjectManagementCrudConflictError('The mandatory YD Timeline cannot be deleted');
    }
    draft.milestones = draft.milestones.filter((item) => item.timelineId !== timeline.id);
    draft.projectTimelines = draft.projectTimelines.filter((item) => item.id !== timeline.id);
    return draft;
  };
}

export interface DeleteProjectCommand { readonly projectId: string }

export function deleteProject(command: DeleteProjectCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    if (!draft.projects.some((item) => item.id === command.projectId)) {
      throw new ProjectManagementCrudConflictError(`Project no longer exists: ${command.projectId}`);
    }
    const timelineIds = new Set(draft.projectTimelines
      .filter((item) => item.projectId === command.projectId)
      .map((item) => item.id));
    draft.projects = draft.projects.filter((item) => item.id !== command.projectId);
    draft.projectTimelines = draft.projectTimelines.filter((item) => item.projectId !== command.projectId);
    draft.milestones = draft.milestones.filter((item) => (
      item.projectId !== command.projectId && !timelineIds.has(item.timelineId)
    ));
    draft.projectMemberships = draft.projectMemberships.filter((item) => item.projectId !== command.projectId);
    draft.projectTeams = draft.projectTeams.filter((item) => item.projectId !== command.projectId);
    for (const project of draft.projects) {
      if (project.reuseProjectId === command.projectId) delete project.reuseProjectId;
    }
    return draft;
  };
}
