export const TIMELINE_SCALES = ['year', 'quarter', 'month', 'week', 'day'] as const;
export type TimelineScale = (typeof TIMELINE_SCALES)[number];

export interface TimelineScaleContract {
  readonly scale: TimelineScale;
  /** Horizontal density measured in pixels per calendar day. */
  readonly pxPerDay: number;
}

export const TIMELINE_SCALE_CONTRACTS: Readonly<Record<TimelineScale, TimelineScaleContract>> =
  Object.freeze({
    year: Object.freeze({ scale: 'year', pxPerDay: 3 }),
    quarter: Object.freeze({ scale: 'quarter', pxPerDay: 3.8 }),
    month: Object.freeze({ scale: 'month', pxPerDay: 4.6 }),
    week: Object.freeze({ scale: 'week', pxPerDay: 6.2 }),
    day: Object.freeze({ scale: 'day', pxPerDay: 8.4 }),
  });

export function selectTimelineScale(scale: TimelineScale): TimelineScaleContract {
  return TIMELINE_SCALE_CONTRACTS[scale];
}
