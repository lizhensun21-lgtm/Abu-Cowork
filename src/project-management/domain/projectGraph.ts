import {
  LIFECYCLE_PHASES,
  MILESTONE_CODES,
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TIMELINE_LANES,
  type ProjectGraph,
} from './types';
import {
  isProjectMembershipStatus,
  isProjectRole,
  normalizeProjectRoles,
  projectMembershipId,
} from './projectMembership';

export interface ProjectGraphValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ProjectGraphValidationResult {
  valid: boolean;
  issues: ProjectGraphValidationIssue[];
}

export function createEmptyProjectGraph(): ProjectGraph {
  return {
    projects: [],
    projectTimelines: [],
    milestones: [],
    persons: [],
    projectMemberships: [],
    projectTeams: [],
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROJECT_STATUS_SET = new Set<string>(PROJECT_STATUSES);
const LIFECYCLE_PHASE_SET = new Set<string>(LIFECYCLE_PHASES);
const PROJECT_TYPE_SET = new Set<string>(PROJECT_TYPES);
const TIMELINE_LANE_SET = new Set<string>(TIMELINE_LANES);
const MILESTONE_CODE_SET = new Set<string>(MILESTONE_CODES);
const MILESTONE_STATUS_SET = new Set<string>(MILESTONE_STATUSES);
const LEGACY_PROJECT_FIELDS = [
  'parentId', 'lane', 'status', 'owner', 'progress', 'taskCount', 'onTimeRate',
  'riskCount', 'milestoneIds', 'modelId', 'baseProgram', 'reusePlatform',
  'lifecycleStatus', 'smtFactory', 'team',
] as const;
const LEGACY_TEAM_FIELDS = [
  'projectManagerId', 'systemEngineerId', 'softwareOwnerId',
  'hardwareOwnerId', 'testOwnerId', 'oemContactId', 'tier1ContactId',
  'memberIds', 'members',
] as const;

function addIssue(
  issues: ProjectGraphValidationIssue[],
  code: string,
  path: string,
  message: string,
) {
  issues.push({ code, path, message });
}

function validateUniqueIds(
  entities: readonly { id: string }[],
  path: string,
  issues: ProjectGraphValidationIssue[],
) {
  const seen = new Set<string>();
  entities.forEach((entity, index) => {
    if (typeof entity.id !== 'string' || !entity.id.trim()) {
      addIssue(issues, 'missing-id', `${path}[${index}].id`, `${path} ID cannot be blank`);
    } else if (seen.has(entity.id)) {
      addIssue(issues, 'duplicate-id', `${path}[${index}].id`, `${path} ID is duplicated: ${entity.id}`);
    }
    seen.add(entity.id);
  });
}

export function isCanonicalDomainDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validRange(startDate: string, endDate: string): boolean {
  return isCanonicalDomainDate(startDate)
    && isCanonicalDomainDate(endDate)
    && startDate <= endDate;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/** Normalizes only the new contract; it never converts or repairs legacy data. */
export function normalizeProjectGraph(graph: ProjectGraph): ProjectGraph {
  return {
    projects: graph.projects.map((project) => {
      const { projectCode: rawProjectCode, ...fields } = project;
      const projectCode = optionalText(rawProjectCode);
      return {
        ...fields,
        name: project.name.trim(),
        ...(projectCode === undefined ? {} : { projectCode }),
      };
    }),
    projectTimelines: graph.projectTimelines.map((timeline) => ({
      ...timeline,
      name: timeline.name.trim(),
      keyResources: timeline.keyResources.map((item) => item.trim()).filter(Boolean),
    })),
    milestones: graph.milestones.map((milestone) => ({
      ...milestone,
      title: milestone.title.trim(),
    })),
    persons: graph.persons.map((person) => {
      const { title: rawTitle, ...fields } = person;
      const title = optionalText(rawTitle);
      return { ...fields, name: person.name.trim(), ...(title === undefined ? {} : { title }) };
    }),
    projectMemberships: graph.projectMemberships.map((membership) => ({
      ...membership,
      roles: normalizeProjectRoles(membership.roles),
    })),
    projectTeams: graph.projectTeams.map((team) => {
      const { externalProjectManager: rawManager, ...fields } = team;
      const externalProjectManager = optionalText(rawManager);
      return {
        ...fields,
        ...(externalProjectManager === undefined ? {} : { externalProjectManager }),
      };
    }),
  };
}

export function validateProjectGraph(graph: ProjectGraph): ProjectGraphValidationResult {
  const issues: ProjectGraphValidationIssue[] = [];
  validateUniqueIds(graph.projects, 'projects', issues);
  validateUniqueIds(graph.projectTimelines, 'projectTimelines', issues);
  validateUniqueIds(graph.milestones, 'milestones', issues);
  validateUniqueIds(graph.persons, 'persons', issues);
  validateUniqueIds(graph.projectMemberships, 'projectMemberships', issues);

  const projectIds = new Set(graph.projects.map((project) => project.id));
  const personIds = new Set(graph.persons.map((person) => person.id));
  const timelinesById = new Map(graph.projectTimelines.map((timeline) => [timeline.id, timeline]));
  const projectCodes = new Map<string, string>();

  graph.projects.forEach((project, index) => {
    const path = `projects[${index}]`;
    for (const field of LEGACY_PROJECT_FIELDS) {
      if (Object.hasOwn(project as object, field)) addIssue(issues, 'legacy-project-field', `${path}.${field}`, `Project ${project.id} cannot contain legacy field ${field}`);
    }
    if (!project.name.trim()) addIssue(issues, 'missing-project-name', `${path}.name`, 'Project name cannot be blank');
    if (!PROJECT_STATUS_SET.has(project.projectStatus)) addIssue(issues, 'invalid-project-status', `${path}.projectStatus`, `Project ${project.id} status is invalid`);
    if (project.lifecyclePhase !== undefined && !LIFECYCLE_PHASE_SET.has(project.lifecyclePhase)) addIssue(issues, 'invalid-lifecycle-phase', `${path}.lifecyclePhase`, `Project ${project.id} lifecycle phase is invalid`);
    if (project.projectType !== undefined && !PROJECT_TYPE_SET.has(project.projectType)) addIssue(issues, 'invalid-project-type', `${path}.projectType`, `Project ${project.id} type is invalid`);
    if (!validRange(project.startDate, project.endDate)) addIssue(issues, 'invalid-project-date-range', path, `Project ${project.id} date range is invalid`);

    if (project.projectCode !== undefined) {
      const code = project.projectCode.trim();
      const key = code.toLocaleLowerCase();
      if (!code) addIssue(issues, 'empty-project-code', `${path}.projectCode`, `Project ${project.id} projectCode cannot be blank`);
      else if (projectCodes.has(key)) addIssue(issues, 'duplicate-project-code', `${path}.projectCode`, `Project ${project.id} projectCode duplicates Project ${projectCodes.get(key)}`);
      else projectCodes.set(key, project.id);
    }
    if (project.reuseProjectId !== undefined) {
      if (!project.reuseProjectId.trim()) addIssue(issues, 'invalid-reuse-project-id', `${path}.reuseProjectId`, `Project ${project.id} reuseProjectId cannot be blank`);
      else if (project.reuseProjectId === project.id) addIssue(issues, 'self-reuse-project', `${path}.reuseProjectId`, `Project ${project.id} cannot reuse itself`);
      else if (!projectIds.has(project.reuseProjectId)) addIssue(issues, 'orphan-reuse-project', `${path}.reuseProjectId`, `Project ${project.id} references a missing reuse Project`);
    }
  });

  const lanesByProject = new Map<string, Set<string>>();
  graph.projectTimelines.forEach((timeline, index) => {
    const path = `projectTimelines[${index}]`;
    if (!projectIds.has(timeline.projectId)) addIssue(issues, 'orphan-timeline', `${path}.projectId`, `Timeline ${timeline.id} references a missing Project`);
    if (!TIMELINE_LANE_SET.has(timeline.lane)) addIssue(issues, 'invalid-timeline-lane', `${path}.lane`, `Timeline ${timeline.id} lane is invalid`);
    if (!timeline.name.trim()) addIssue(issues, 'missing-timeline-name', `${path}.name`, `Timeline ${timeline.id} name cannot be blank`);
    if (!validRange(timeline.startDate, timeline.endDate)) addIssue(issues, 'invalid-timeline-date-range', path, `Timeline ${timeline.id} date range is invalid`);
    if (!Array.isArray(timeline.keyResources) || timeline.keyResources.some((item) => typeof item !== 'string')) addIssue(issues, 'invalid-key-resources', `${path}.keyResources`, `Timeline ${timeline.id} keyResources must be strings`);
    const lanes = lanesByProject.get(timeline.projectId) ?? new Set<string>();
    if (lanes.has(timeline.lane)) addIssue(issues, 'duplicate-project-lane', `${path}.lane`, `Project ${timeline.projectId} has duplicate ${timeline.lane} Timeline`);
    lanes.add(timeline.lane);
    lanesByProject.set(timeline.projectId, lanes);
  });

  graph.projects.forEach((project, index) => {
    const yd = graph.projectTimelines.filter((timeline) => timeline.projectId === project.id && timeline.lane === 'YD');
    if (yd.length !== 1) addIssue(issues, 'invalid-yd-count', `projects[${index}]`, `Project ${project.id} must have exactly one YD Timeline`);
    else if (project.startDate !== yd[0].startDate || project.endDate !== yd[0].endDate) addIssue(issues, 'project-yd-date-mismatch', `projects[${index}]`, `Project ${project.id} dates must match its YD Timeline`);
  });

  graph.milestones.forEach((milestone, index) => {
    const path = `milestones[${index}]`;
    const timeline = timelinesById.get(milestone.timelineId);
    if (!projectIds.has(milestone.projectId)) addIssue(issues, 'orphan-milestone-project', `${path}.projectId`, `Milestone ${milestone.id} references a missing Project`);
    if (!timeline) addIssue(issues, 'orphan-milestone-timeline', `${path}.timelineId`, `Milestone ${milestone.id} references a missing Timeline`);
    else {
      if (timeline.projectId !== milestone.projectId) addIssue(issues, 'milestone-project-mismatch', `${path}.projectId`, `Milestone ${milestone.id} projectId must match its Timeline`);
      if (timeline.lane !== milestone.lane) addIssue(issues, 'milestone-lane-mismatch', `${path}.lane`, `Milestone ${milestone.id} lane must match its Timeline`);
    }
    if (!milestone.title.trim()) addIssue(issues, 'missing-milestone-title', `${path}.title`, `Milestone ${milestone.id} title cannot be blank`);
    if (!isCanonicalDomainDate(milestone.date)) addIssue(issues, 'invalid-milestone-date', `${path}.date`, `Milestone ${milestone.id} date is invalid`);
    if (milestone.code !== '' && !MILESTONE_CODE_SET.has(milestone.code)) addIssue(issues, 'invalid-milestone-code', `${path}.code`, `Milestone ${milestone.id} code is invalid`);
    if (milestone.status !== undefined && !MILESTONE_STATUS_SET.has(milestone.status)) addIssue(issues, 'invalid-milestone-status', `${path}.status`, `Milestone ${milestone.id} status is invalid`);
  });

  graph.persons.forEach((person, index) => {
    if (!person.name.trim()) addIssue(issues, 'missing-person-name', `persons[${index}].name`, `Person ${person.id} name cannot be blank`);
    if (person.title !== undefined && typeof person.title !== 'string') addIssue(issues, 'invalid-person-title', `persons[${index}].title`, `Person ${person.id} title must be a string`);
  });

  validateMemberships(graph, projectIds, personIds, issues);
  validateTeams(graph, projectIds, issues);
  return { valid: issues.length === 0, issues };
}

function validateMemberships(
  graph: ProjectGraph,
  projectIds: Set<string>,
  personIds: Set<string>,
  issues: ProjectGraphValidationIssue[],
) {
  const pairs = new Set<string>();
  const activeManagers = new Map<string, number>();
  graph.projectMemberships.forEach((membership, index) => {
    const path = `projectMemberships[${index}]`;
    if (!projectIds.has(membership.projectId)) addIssue(issues, 'orphan-membership-project', `${path}.projectId`, `Membership ${membership.id} references a missing Project`);
    if (!personIds.has(membership.personId)) addIssue(issues, 'orphan-membership-person', `${path}.personId`, `Membership ${membership.id} references a missing Person`);
    const expectedId = projectMembershipId(membership.projectId, membership.personId);
    if (membership.id !== expectedId) addIssue(issues, 'invalid-membership-id', `${path}.id`, `Membership ID must be ${expectedId}`);
    const pair = `${membership.projectId.length}:${membership.projectId}:${membership.personId.length}:${membership.personId}`;
    if (pairs.has(pair)) addIssue(issues, 'duplicate-project-person-membership', path, `Project ${membership.projectId} has duplicate membership for Person ${membership.personId}`);
    pairs.add(pair);
    if (!membership.roles.length) addIssue(issues, 'missing-membership-roles', `${path}.roles`, `Membership ${membership.id} requires a role`);
    if (membership.roles.some((role) => !isProjectRole(role))) addIssue(issues, 'invalid-membership-role', `${path}.roles`, `Membership ${membership.id} contains an invalid role`);
    if (new Set(membership.roles).size !== membership.roles.length) addIssue(issues, 'duplicate-membership-role', `${path}.roles`, `Membership ${membership.id} contains duplicate roles`);
    if (membership.roles.includes('member') && membership.roles.some((role) => role !== 'member')) addIssue(issues, 'redundant-member-role', `${path}.roles`, `Membership ${membership.id} combines member with a specialized role`);
    if (!isProjectMembershipStatus(membership.status)) addIssue(issues, 'invalid-membership-status', `${path}.status`, `Membership ${membership.id} status is invalid`);
    for (const [field, date] of [['joinedAt', membership.joinedAt], ['leftAt', membership.leftAt]] as const) {
      if (date !== undefined && !isCanonicalDomainDate(date)) addIssue(issues, 'invalid-membership-date', `${path}.${field}`, `Membership ${membership.id} ${field} is invalid`);
    }
    if (membership.status === 'active' && membership.leftAt !== undefined) addIssue(issues, 'active-membership-left-at', `${path}.leftAt`, `Active Membership ${membership.id} cannot have leftAt`);
    if (membership.status === 'active' && membership.roles.includes('project_manager')) activeManagers.set(membership.projectId, (activeManagers.get(membership.projectId) ?? 0) + 1);
  });
  for (const [projectId, count] of activeManagers) {
    if (count > 1) addIssue(issues, 'multiple-active-project-managers', 'projectMemberships', `Project ${projectId} has more than one active project_manager`);
  }
}

function validateTeams(
  graph: ProjectGraph,
  projectIds: Set<string>,
  issues: ProjectGraphValidationIssue[],
) {
  const teamProjects = new Set<string>();
  graph.projectTeams.forEach((team, index) => {
    const path = `projectTeams[${index}]`;
    if (!projectIds.has(team.projectId)) addIssue(issues, 'orphan-project-team', `${path}.projectId`, 'ProjectTeam references a missing Project');
    if (teamProjects.has(team.projectId)) addIssue(issues, 'duplicate-project-team', `${path}.projectId`, `Project ${team.projectId} has duplicate ProjectTeam records`);
    teamProjects.add(team.projectId);
    for (const field of LEGACY_TEAM_FIELDS) {
      if (Object.hasOwn(team as object, field)) addIssue(issues, 'legacy-project-team-field', `${path}.${field}`, `ProjectTeam cannot contain legacy field ${field}`);
    }
    if (team.externalProjectManager !== undefined && typeof team.externalProjectManager !== 'string') addIssue(issues, 'invalid-external-project-manager', `${path}.externalProjectManager`, 'externalProjectManager must be a string');
  });
}

export function assertValidProjectGraph(graph: ProjectGraph): void {
  const result = validateProjectGraph(graph);
  if (!result.valid) {
    const first = result.issues[0];
    throw new Error(`${first.path}: ${first.message}`);
  }
}
