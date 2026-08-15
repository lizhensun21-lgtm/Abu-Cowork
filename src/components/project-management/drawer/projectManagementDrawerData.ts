import type {
  Milestone,
  Person,
  Project,
  ProjectGraph,
  ProjectTimeline,
} from '@/project-management/domain';

export type ProjectManagementDrawerTarget =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'timeline'; readonly timelineId: string }
  | { readonly kind: 'milestone'; readonly milestoneId: string };

export interface ProjectDrawerData {
  readonly kind: 'project';
  readonly project: Readonly<Project>;
  readonly projectManager?: Readonly<Person>;
  readonly members: ReadonlyArray<Readonly<Person>>;
  readonly milestones: ReadonlyArray<Readonly<Milestone>>;
}

export interface TimelineDrawerData {
  readonly kind: 'timeline';
  readonly timeline: Readonly<ProjectTimeline>;
  readonly project: Readonly<Project>;
  readonly milestones: ReadonlyArray<Readonly<Milestone>>;
}

export interface MilestoneDrawerData {
  readonly kind: 'milestone';
  readonly milestone: Readonly<Milestone>;
  readonly timeline: Readonly<ProjectTimeline>;
  readonly project: Readonly<Project>;
}

export type ProjectManagementDrawerData =
  | ProjectDrawerData
  | TimelineDrawerData
  | MilestoneDrawerData;

export function projectManagementDrawerTargetKey(target: ProjectManagementDrawerTarget) {
  if (target.kind === 'project') return `project:${target.projectId}`;
  if (target.kind === 'timeline') return `timeline:${target.timelineId}`;
  return `milestone:${target.milestoneId}`;
}

export function selectProjectManager(
  graph: Readonly<ProjectGraph>,
  projectId: string,
): Readonly<Person> | undefined {
  const membership = graph.projectMemberships.find((item) => (
    item.projectId === projectId
    && item.status === 'active'
    && item.roles.includes('project_manager')
  ));
  return membership
    ? graph.persons.find((person) => person.id === membership.personId)
    : undefined;
}

export function selectProjectManagementDrawerData(
  graph: Readonly<ProjectGraph>,
  target: ProjectManagementDrawerTarget,
): ProjectManagementDrawerData | null {
  if (target.kind === 'project') {
    const project = graph.projects.find((item) => item.id === target.projectId);
    return project ? {
      kind: 'project',
      project,
      projectManager: selectProjectManager(graph, project.id),
      members: graph.projectMemberships.flatMap((membership) => {
        if (membership.projectId !== project.id || membership.status !== 'active') return [];
        const person = graph.persons.find((item) => item.id === membership.personId);
        return person ? [person] : [];
      }),
      milestones: graph.milestones.filter((milestone) => milestone.projectId === project.id),
    } : null;
  }
  if (target.kind === 'timeline') {
    const timeline = graph.projectTimelines.find((item) => item.id === target.timelineId);
    const project = timeline
      ? graph.projects.find((item) => item.id === timeline.projectId)
      : undefined;
    return timeline && project ? {
      kind: 'timeline',
      timeline,
      project,
      milestones: graph.milestones.filter((milestone) => milestone.timelineId === timeline.id),
    } : null;
  }
  const milestone = graph.milestones.find((item) => item.id === target.milestoneId);
  const timeline = milestone
    ? graph.projectTimelines.find((item) => item.id === milestone.timelineId)
    : undefined;
  const project = milestone
    ? graph.projects.find((item) => item.id === milestone.projectId)
    : undefined;
  return milestone && timeline && project
    ? { kind: 'milestone', milestone, timeline, project }
    : null;
}
