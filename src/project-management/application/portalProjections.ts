import type {
  MilestoneStatus,
  ProjectGraph,
  ProjectRole,
  ProjectStatus,
  TimelineLane,
} from '../domain/types';
import { resolveProjectManager } from './teamPresentation';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarEventRow {
  readonly milestoneId: string;
  readonly date: string;
  readonly code: string;
  readonly title: string;
  readonly status?: MilestoneStatus;
  readonly projectId: string;
  readonly projectName: string;
  readonly timelineId: string;
  readonly timelineName: string;
  readonly lane: TimelineLane;
}

export interface CalendarFilters {
  readonly projectId?: string;
  readonly lane?: TimelineLane;
  readonly status?: MilestoneStatus;
}

export function selectCalendarEvents(
  graph: Readonly<ProjectGraph>,
  filters: CalendarFilters = {},
): readonly CalendarEventRow[] {
  const projects = new Map(graph.projects.map((project) => [project.id, project]));
  const timelines = new Map(graph.projectTimelines.map((timeline) => [timeline.id, timeline]));
  return Object.freeze(graph.milestones.flatMap((milestone) => {
    const project = projects.get(milestone.projectId);
    const timeline = timelines.get(milestone.timelineId);
    if (
      !project || !timeline || !CALENDAR_DATE.test(milestone.date)
      || timeline.projectId !== project.id || timeline.lane !== milestone.lane
      || (filters.projectId && project.id !== filters.projectId)
      || (filters.lane && timeline.lane !== filters.lane)
      || (filters.status && milestone.status !== filters.status)
    ) return [];
    return [Object.freeze({
      milestoneId: milestone.id,
      date: milestone.date,
      code: milestone.code,
      title: milestone.title,
      ...(milestone.status ? { status: milestone.status } : {}),
      projectId: project.id,
      projectName: project.name,
      timelineId: timeline.id,
      timelineName: timeline.name,
      lane: timeline.lane,
    })];
  }).sort((left, right) => (
    left.date.localeCompare(right.date)
    || left.projectName.localeCompare(right.projectName)
    || left.timelineName.localeCompare(right.timelineName)
    || left.code.localeCompare(right.code)
    || left.milestoneId.localeCompare(right.milestoneId)
  )));
}

export type LedgerSort = 'name' | 'startDate' | 'endDate' | 'status';

export interface LedgerFilters {
  readonly query?: string;
  readonly status?: ProjectStatus;
  readonly projectManagerId?: string;
  readonly lane?: TimelineLane;
  readonly sort?: LedgerSort;
  readonly direction?: 'asc' | 'desc';
}

export interface LedgerRow {
  readonly projectId: string;
  readonly name: string;
  readonly code?: string;
  readonly status: ProjectStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly projectManagerId?: string;
  readonly projectManagerName?: string;
  readonly lanes: readonly TimelineLane[];
  readonly milestoneCount: number;
}

export function selectLedgerRows(
  graph: Readonly<ProjectGraph>,
  filters: LedgerFilters = {},
): readonly LedgerRow[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  const laneOrder = new Map<TimelineLane, number>([['YD', 0], ['OEM', 1], ['Tier1', 2]]);
  const rows = graph.projects.flatMap((project) => {
    const manager = resolveProjectManager(graph, project.id);
    const timelines = graph.projectTimelines.filter((timeline) => timeline.projectId === project.id);
    if (
      (query && !`${project.name}\n${project.projectCode ?? ''}`.toLocaleLowerCase().includes(query))
      || (filters.status && project.projectStatus !== filters.status)
      || (filters.projectManagerId && manager?.person.id !== filters.projectManagerId)
      || (filters.lane && !timelines.some((timeline) => timeline.lane === filters.lane))
    ) return [];
    const lanes = [...new Set(timelines.map((timeline) => timeline.lane))]
      .sort((left, right) => (laneOrder.get(left) ?? 9) - (laneOrder.get(right) ?? 9));
    return [Object.freeze({
      projectId: project.id,
      name: project.name,
      ...(project.projectCode ? { code: project.projectCode } : {}),
      status: project.projectStatus,
      startDate: project.startDate,
      endDate: project.endDate,
      ...(manager ? {
        projectManagerId: manager.person.id,
        projectManagerName: manager.person.name,
      } : {}),
      lanes: Object.freeze(lanes),
      milestoneCount: graph.milestones.filter((milestone) => milestone.projectId === project.id).length,
    })];
  });
  const field = filters.sort ?? 'name';
  const direction = filters.direction === 'desc' ? -1 : 1;
  return Object.freeze(rows.sort((left, right) => (
    left[field].localeCompare(right[field]) * direction
    || left.name.localeCompare(right.name)
    || left.projectId.localeCompare(right.projectId)
  )));
}

export interface ResourceTimelineUse {
  readonly projectId: string;
  readonly projectName: string;
  readonly timelineId: string;
  readonly timelineName: string;
  readonly lane: TimelineLane;
}

export interface ResourceRow {
  readonly key: string;
  readonly name: string;
  readonly projects: readonly { readonly projectId: string; readonly projectName: string }[];
  readonly timelines: readonly ResourceTimelineUse[];
}

function normalizeResource(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function selectResourceRows(graph: Readonly<ProjectGraph>): readonly ResourceRow[] {
  const projects = new Map(graph.projects.map((project) => [project.id, project]));
  const groups = new Map<string, { name: string; timelines: ResourceTimelineUse[] }>();
  for (const timeline of graph.projectTimelines) {
    const project = projects.get(timeline.projectId);
    if (!project) continue;
    for (const rawResource of timeline.keyResources) {
      const name = normalizeResource(rawResource);
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      const group = groups.get(key) ?? { name, timelines: [] };
      if (!group.timelines.some((item) => item.timelineId === timeline.id)) {
        group.timelines.push({
          projectId: project.id,
          projectName: project.name,
          timelineId: timeline.id,
          timelineName: timeline.name,
          lane: timeline.lane,
        });
      }
      groups.set(key, group);
    }
  }
  return Object.freeze([...groups.entries()].map(([key, group]) => {
    const projectsForResource = [...new Map(group.timelines.map((item) => [item.projectId, {
      projectId: item.projectId,
      projectName: item.projectName,
    }])).values()].sort((left, right) => left.projectName.localeCompare(right.projectName));
    return Object.freeze({
      key,
      name: group.name,
      projects: Object.freeze(projectsForResource),
      timelines: Object.freeze(group.timelines.sort((left, right) => (
        left.projectName.localeCompare(right.projectName)
        || left.timelineName.localeCompare(right.timelineName)
        || left.timelineId.localeCompare(right.timelineId)
      ))),
    });
  }).sort((left, right) => left.name.localeCompare(right.name)));
}

export interface MemberProjectRelation {
  readonly projectId: string;
  readonly projectName: string;
  readonly roles: readonly ProjectRole[];
  readonly isProjectManager: boolean;
}

export interface MemberRow {
  readonly personId: string;
  readonly name: string;
  readonly title?: string;
  readonly projects: readonly MemberProjectRelation[];
  readonly roles: readonly ProjectRole[];
}

export function selectMemberRows(
  graph: Readonly<ProjectGraph>,
  queryValue = '',
): readonly MemberRow[] {
  const query = queryValue.trim().toLocaleLowerCase();
  const projects = new Map(graph.projects.map((project) => [project.id, project]));
  return Object.freeze(graph.persons.flatMap((person) => {
    if (query && !`${person.name}\n${person.title ?? ''}`.toLocaleLowerCase().includes(query)) return [];
    const relations = graph.projectMemberships.flatMap((membership) => {
      const project = projects.get(membership.projectId);
      if (membership.personId !== person.id || membership.status !== 'active' || !project) return [];
      return [Object.freeze({
        projectId: project.id,
        projectName: project.name,
        roles: Object.freeze([...membership.roles]),
        isProjectManager: membership.roles.includes('project_manager'),
      })];
    }).sort((left, right) => left.projectName.localeCompare(right.projectName));
    return [Object.freeze({
      personId: person.id,
      name: person.name,
      ...(person.title ? { title: person.title } : {}),
      projects: Object.freeze(relations),
      roles: Object.freeze([...new Set(relations.flatMap((relation) => relation.roles))]),
    })];
  }).sort((left, right) => left.name.localeCompare(right.name) || left.personId.localeCompare(right.personId)));
}
