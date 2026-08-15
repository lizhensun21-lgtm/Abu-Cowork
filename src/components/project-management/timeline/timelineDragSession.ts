import type { TimelineMilestone } from '@/project-management/domain';
import {
  addTimelineDays,
  timelineDaysBetween,
  type TimelineCoordinates,
} from '@/project-management/timeline';

export const TIMELINE_DRAG_THRESHOLD_PX = 5;

export type TimelineEdgeDirection = 'left' | 'right';

export interface TimelineEdgeExtensionTrigger {
  readonly pointerX: number;
  readonly pointerRevision: number;
  readonly direction: TimelineEdgeDirection;
  readonly boundary: string;
}

export interface TimelineEdgeExtensionGate {
  readonly pointerX: number | null;
  readonly pointerRevision: number;
  readonly lastTrigger: TimelineEdgeExtensionTrigger | null;
}

export const EMPTY_TIMELINE_EDGE_EXTENSION_GATE: TimelineEdgeExtensionGate = {
  pointerX: null,
  pointerRevision: 0,
  lastTrigger: null,
};

export function evaluateTimelineEdgeExtension(
  gate: TimelineEdgeExtensionGate,
  pointerX: number,
  direction: TimelineEdgeDirection | null,
  boundary: string | null,
): { readonly gate: TimelineEdgeExtensionGate; readonly shouldExtend: boolean } {
  const pointerMoved = gate.pointerX !== pointerX;
  const pointerRevision = pointerMoved ? gate.pointerRevision + 1 : gate.pointerRevision;
  const observedGate = pointerMoved ? { ...gate, pointerX, pointerRevision } : gate;
  if (direction === null || boundary === null) {
    return { gate: observedGate, shouldExtend: false };
  }
  if (gate.lastTrigger?.pointerRevision === pointerRevision) {
    return { gate: observedGate, shouldExtend: false };
  }
  return {
    gate: {
      pointerX,
      pointerRevision,
      lastTrigger: { pointerX, pointerRevision, direction, boundary },
    },
    shouldExtend: true,
  };
}

interface TimelinePointerSession {
  readonly pointerId: number;
  readonly startPointerX: number;
  readonly currentPointerX: number;
  readonly hasExceededDragThreshold: boolean;
}

export interface MilestoneDragSession extends TimelinePointerSession {
  readonly type: 'milestone';
  readonly sourceEntityId: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly originalDate: string;
  readonly previewDate: string;
}

export interface ProjectBarMoveSession extends TimelinePointerSession {
  readonly type: 'project-bar-move';
  readonly sourceEntityId: string;
  readonly projectId: string;
  readonly originalStartDate: string;
  readonly originalEndDate: string;
  readonly previewStartDate: string;
  readonly previewEndDate: string;
  readonly deltaDays: number;
  readonly originalMilestones: ReadonlyArray<{
    readonly id: string;
    readonly date: string;
  }>;
}

export interface ProjectBarResizeSession extends TimelinePointerSession {
  readonly type: 'project-bar-resize-start' | 'project-bar-resize-end';
  readonly sourceEntityId: string;
  readonly projectId: string;
  readonly originalStartDate: string;
  readonly originalEndDate: string;
  readonly previewStartDate: string;
  readonly previewEndDate: string;
}

export type TimelineDragSession =
  | MilestoneDragSession
  | ProjectBarMoveSession
  | ProjectBarResizeSession;

export function createMilestoneDragSession(
  milestone: Readonly<TimelineMilestone>,
  pointerId: number,
  pointerX: number,
): MilestoneDragSession {
  return {
    type: 'milestone',
    pointerId,
    sourceEntityId: milestone.id,
    projectId: milestone.projectId,
    timelineId: milestone.timelineId,
    startPointerX: pointerX,
    currentPointerX: pointerX,
    originalDate: milestone.date,
    previewDate: milestone.date,
    hasExceededDragThreshold: false,
  };
}

export function updateMilestoneDragPreview(
  session: MilestoneDragSession,
  pointerX: number,
  coordinates: TimelineCoordinates,
): MilestoneDragSession {
  const hasExceededDragThreshold = session.hasExceededDragThreshold
    || Math.abs(pointerX - session.startPointerX) > TIMELINE_DRAG_THRESHOLD_PX;
  if (!hasExceededDragThreshold) {
    return { ...session, currentPointerX: pointerX };
  }

  const originalX = coordinates.dateToX(session.originalDate);
  return {
    ...session,
    currentPointerX: pointerX,
    hasExceededDragThreshold,
    previewDate: coordinates.xToDate(originalX + pointerX - session.startPointerX),
  };
}

export function createProjectBarMoveSession(
  timeline: Readonly<{ id: string; projectId: string; startDate: string; endDate: string }>,
  milestones: ReadonlyArray<Readonly<Pick<TimelineMilestone, 'id' | 'date'>>>,
  pointerId: number,
  pointerX: number,
): ProjectBarMoveSession {
  return {
    type: 'project-bar-move',
    pointerId,
    sourceEntityId: timeline.id,
    projectId: timeline.projectId,
    startPointerX: pointerX,
    currentPointerX: pointerX,
    hasExceededDragThreshold: false,
    originalStartDate: timeline.startDate,
    originalEndDate: timeline.endDate,
    previewStartDate: timeline.startDate,
    previewEndDate: timeline.endDate,
    deltaDays: 0,
    originalMilestones: milestones.map(({ id, date }) => ({ id, date })),
  };
}

export function updateProjectBarMovePreview(
  session: ProjectBarMoveSession,
  pointerX: number,
  coordinates: TimelineCoordinates,
): ProjectBarMoveSession {
  const hasExceededDragThreshold = session.hasExceededDragThreshold
    || Math.abs(pointerX - session.startPointerX) > TIMELINE_DRAG_THRESHOLD_PX;
  if (!hasExceededDragThreshold) return { ...session, currentPointerX: pointerX };
  const previewStartDate = coordinates.xToDate(
    coordinates.dateToX(session.originalStartDate) + pointerX - session.startPointerX,
  );
  const deltaDays = timelineDaysBetween(session.originalStartDate, previewStartDate);
  return {
    ...session,
    currentPointerX: pointerX,
    hasExceededDragThreshold,
    previewStartDate,
    previewEndDate: addTimelineDays(session.originalEndDate, deltaDays),
    deltaDays,
  };
}

export function createProjectBarResizeSession(
  timeline: Readonly<{ id: string; projectId: string; startDate: string; endDate: string }>,
  side: 'start' | 'end',
  pointerId: number,
  pointerX: number,
): ProjectBarResizeSession {
  return {
    type: side === 'start' ? 'project-bar-resize-start' : 'project-bar-resize-end',
    pointerId,
    sourceEntityId: timeline.id,
    projectId: timeline.projectId,
    startPointerX: pointerX,
    currentPointerX: pointerX,
    hasExceededDragThreshold: false,
    originalStartDate: timeline.startDate,
    originalEndDate: timeline.endDate,
    previewStartDate: timeline.startDate,
    previewEndDate: timeline.endDate,
  };
}

export function updateProjectBarResizePreview(
  session: ProjectBarResizeSession,
  pointerX: number,
  coordinates: TimelineCoordinates,
): ProjectBarResizeSession {
  const hasExceededDragThreshold = session.hasExceededDragThreshold
    || Math.abs(pointerX - session.startPointerX) > TIMELINE_DRAG_THRESHOLD_PX;
  if (!hasExceededDragThreshold) return { ...session, currentPointerX: pointerX };
  const side = session.type === 'project-bar-resize-start' ? 'start' : 'end';
  const originalBoundary = side === 'start'
    ? session.originalStartDate
    : session.originalEndDate;
  const candidate = coordinates.xToDate(
    coordinates.dateToX(originalBoundary) + pointerX - session.startPointerX,
  );
  const clamped = side === 'start'
    ? (candidate > session.originalEndDate ? session.originalEndDate : candidate)
    : (candidate < session.originalStartDate ? session.originalStartDate : candidate);
  return {
    ...session,
    currentPointerX: pointerX,
    hasExceededDragThreshold,
    previewStartDate: side === 'start' ? clamped : session.originalStartDate,
    previewEndDate: side === 'end' ? clamped : session.originalEndDate,
  };
}
