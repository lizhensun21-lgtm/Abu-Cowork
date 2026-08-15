import { addTimelineDays } from '../timeline/coordinates';
import type { ProjectGraph, ProjectTimeline } from '../domain/types';
import type { ProjectGraphMutation } from './projectGraphRuntime';

interface ExpectedTimelineRange {
  readonly timelineId: string;
  readonly projectId: string;
  readonly expectedStartDate: string;
  readonly expectedEndDate: string;
}

export interface MoveProjectTimelineCommand extends ExpectedTimelineRange {
  readonly deltaDays: number;
  readonly expectedMilestones: ReadonlyArray<{
    readonly id: string;
    readonly date: string;
  }>;
}

export interface ResizeProjectTimelineCommand extends ExpectedTimelineRange {
  readonly side: 'start' | 'end';
  readonly date: string;
}

export class ProjectTimelineMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectTimelineMutationConflictError';
  }
}

function resolveTimeline(
  draft: ProjectGraph,
  command: ExpectedTimelineRange,
): ProjectTimeline {
  const timeline = draft.projectTimelines.find((item) => item.id === command.timelineId);
  if (!timeline) {
    throw new ProjectTimelineMutationConflictError(
      `ProjectTimeline no longer exists: ${command.timelineId}`,
    );
  }
  if (timeline.projectId !== command.projectId) {
    throw new ProjectTimelineMutationConflictError(
      `ProjectTimeline relationship changed before commit: ${command.timelineId}`,
    );
  }
  if (
    timeline.startDate !== command.expectedStartDate
    || timeline.endDate !== command.expectedEndDate
  ) {
    throw new ProjectTimelineMutationConflictError(
      `ProjectTimeline range changed before commit: ${command.timelineId}`,
    );
  }
  return timeline;
}

function mirrorYdProjectDates(draft: ProjectGraph, timeline: ProjectTimeline) {
  if (timeline.lane !== 'YD') return;
  const project = draft.projects.find((item) => item.id === timeline.projectId);
  if (!project) {
    throw new ProjectTimelineMutationConflictError(
      `Project no longer exists: ${timeline.projectId}`,
    );
  }
  project.startDate = timeline.startDate;
  project.endDate = timeline.endDate;
}

/** Atomically shifts one ProjectTimeline and every Milestone that belongs to it. */
export function moveProjectTimeline(
  command: MoveProjectTimelineCommand,
): ProjectGraphMutation {
  return (draft) => {
    if (!Number.isInteger(command.deltaDays)) {
      throw new ProjectTimelineMutationConflictError('ProjectTimeline deltaDays must be an integer');
    }
    const timeline = resolveTimeline(draft, command);
    const milestones = draft.milestones.filter((item) => item.timelineId === timeline.id);
    const expectedById = new Map(command.expectedMilestones.map((item) => [item.id, item.date]));
    if (
      milestones.length !== expectedById.size
      || milestones.some((milestone) => expectedById.get(milestone.id) !== milestone.date)
    ) {
      throw new ProjectTimelineMutationConflictError(
        `ProjectTimeline Milestones changed before commit: ${timeline.id}`,
      );
    }

    timeline.startDate = addTimelineDays(timeline.startDate, command.deltaDays);
    timeline.endDate = addTimelineDays(timeline.endDate, command.deltaDays);
    for (const milestone of milestones) {
      milestone.date = addTimelineDays(milestone.date, command.deltaDays);
    }
    mirrorYdProjectDates(draft, timeline);
    return draft;
  };
}

/** Resizes only one boundary; Milestone dates remain untouched. */
export function resizeProjectTimeline(
  command: ResizeProjectTimelineCommand,
): ProjectGraphMutation {
  return (draft) => {
    const timeline = resolveTimeline(draft, command);
    if (command.side === 'start') timeline.startDate = command.date;
    else timeline.endDate = command.date;
    mirrorYdProjectDates(draft, timeline);
    return draft;
  };
}
