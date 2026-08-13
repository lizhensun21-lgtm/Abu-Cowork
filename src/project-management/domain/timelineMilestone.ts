import type { Milestone, TimelineMilestone } from './types';

/** Milestone remains the sole mutable source; this projection is never persisted. */
export function toTimelineMilestone(milestone: Milestone): Readonly<TimelineMilestone> {
  return Object.freeze({
    id: milestone.id,
    projectId: milestone.projectId,
    timelineId: milestone.timelineId,
    lane: milestone.lane,
    name: milestone.title,
    date: milestone.date,
    ...(milestone.code ? { stageGate: milestone.code } : {}),
    ...(milestone.status === undefined ? {} : { status: milestone.status }),
    ...(milestone.note === undefined ? {} : { note: milestone.note }),
  });
}

export function toTimelineMilestones(
  milestones: readonly Milestone[],
): ReadonlyArray<Readonly<TimelineMilestone>> {
  return Object.freeze(milestones.map(toTimelineMilestone));
}
