import { selectProjectOrder } from '../application/projectOrder';
import { toTimelineMilestone } from '../domain/timelineMilestone';
import type {
  ProjectGraph,
  ProjectTimeline,
  TimelineLane,
  TimelineMilestone,
} from '../domain/types';

const LANE_ORDER: Readonly<Record<TimelineLane, number>> = Object.freeze({
  YD: 0,
  Tier1: 1,
  OEM: 2,
});

export interface TimelineRow {
  readonly rowKey: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly lane: TimelineLane;
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly milestones: ReadonlyArray<Readonly<TimelineMilestone>>;
}

export function selectTimelineRows(
  graph: Readonly<ProjectGraph>,
): readonly TimelineRow[] {
  const projectsById = new Map(graph.projects.map((project) => [project.id, project]));
  const timelinesByProjectId = new Map<string, ProjectTimeline[]>();
  for (const timeline of graph.projectTimelines) {
    if (!projectsById.has(timeline.projectId)) continue;
    const timelines = timelinesByProjectId.get(timeline.projectId) ?? [];
    timelines.push(timeline);
    timelinesByProjectId.set(timeline.projectId, timelines);
  }

  const validTimelines = new Map<string, ProjectTimeline>();
  const timelineIdCounts = new Map<string, number>();
  for (const timeline of graph.projectTimelines) {
    timelineIdCounts.set(timeline.id, (timelineIdCounts.get(timeline.id) ?? 0) + 1);
  }
  for (const projectId of selectProjectOrder(graph)) {
    const timelines = timelinesByProjectId.get(projectId) ?? [];
    for (const lane of ['YD', 'Tier1', 'OEM'] as const) {
      const laneTimelines = timelines.filter((timeline) => timeline.lane === lane);
      if (laneTimelines.length === 1 && timelineIdCounts.get(laneTimelines[0].id) === 1) {
        validTimelines.set(laneTimelines[0].id, laneTimelines[0]);
      }
    }
  }

  const milestonesByTimelineId = new Map<string, Readonly<TimelineMilestone>[]>();
  for (const milestone of graph.milestones) {
    const timeline = validTimelines.get(milestone.timelineId);
    if (!timeline
      || timeline.projectId !== milestone.projectId
      || timeline.lane !== milestone.lane) continue;
    const milestones = milestonesByTimelineId.get(timeline.id) ?? [];
    milestones.push(toTimelineMilestone(milestone));
    milestonesByTimelineId.set(timeline.id, milestones);
  }

  const rows: TimelineRow[] = [];
  for (const projectId of selectProjectOrder(graph)) {
    const project = projectsById.get(projectId);
    if (!project) continue;
    const timelines = [...validTimelines.values()]
      .filter((timeline) => timeline.projectId === projectId)
      .sort((left, right) => LANE_ORDER[left.lane] - LANE_ORDER[right.lane]);
    for (const timeline of timelines) {
      rows.push(Object.freeze({
        rowKey: timeline.id,
        projectId,
        timelineId: timeline.id,
        lane: timeline.lane,
        label: timeline.lane === 'YD' ? project.name : timeline.name,
        startDate: timeline.startDate,
        endDate: timeline.endDate,
        milestones: Object.freeze(milestonesByTimelineId.get(timeline.id) ?? []),
      }));
    }
  }
  return Object.freeze(rows);
}

export function getTimelineRowForMilestone(
  rows: readonly TimelineRow[],
  milestone: Pick<TimelineMilestone, 'projectId' | 'timelineId' | 'lane'>,
): TimelineRow | undefined {
  return rows.find((row) => row.timelineId === milestone.timelineId
    && row.projectId === milestone.projectId
    && row.lane === milestone.lane);
}
