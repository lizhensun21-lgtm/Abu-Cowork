import type { TimelineCoordinates } from '@/project-management/timeline';

export interface TimelineBarGeometry {
  readonly left: number;
  readonly width: number;
}

export function getTimelineBarGeometry(
  timeline: Readonly<{ startDate?: string; endDate?: string }>,
  coordinates: TimelineCoordinates,
): TimelineBarGeometry | null {
  if (!timeline.startDate || !timeline.endDate) return null;
  const left = coordinates.dateToX(timeline.startDate);
  return Object.freeze({
    left,
    width: Math.max(
      coordinates.dateToX(timeline.endDate) - left,
      coordinates.pxPerDay,
    ),
  });
}
