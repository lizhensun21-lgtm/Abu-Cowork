export const TIMELINE_TIME_SCALES = ['year', 'quarter', 'month', 'week', 'day'] as const;
export type TimelineTimeScale = (typeof TIMELINE_TIME_SCALES)[number];
export const DEFAULT_TIMELINE_TIME_SCALE: TimelineTimeScale = 'week';

export type TimelineRulerSegmentUnit = 'year' | 'quarter' | 'month';
export type TimelineRulerTickUnit = 'year' | 'quarter' | 'month' | 'week' | 'day';

export interface TimelineTimeScaleContract {
  readonly scale: TimelineTimeScale;
  readonly segmentUnit: TimelineRulerSegmentUnit;
  readonly tickUnit: TimelineRulerTickUnit;
}

export const TIMELINE_TIME_SCALE_CONTRACTS: Readonly<
  Record<TimelineTimeScale, TimelineTimeScaleContract>
> = Object.freeze({
  year: Object.freeze({ scale: 'year', segmentUnit: 'year', tickUnit: 'year' }),
  quarter: Object.freeze({ scale: 'quarter', segmentUnit: 'quarter', tickUnit: 'quarter' }),
  month: Object.freeze({ scale: 'month', segmentUnit: 'month', tickUnit: 'month' }),
  week: Object.freeze({ scale: 'week', segmentUnit: 'month', tickUnit: 'week' }),
  day: Object.freeze({ scale: 'day', segmentUnit: 'month', tickUnit: 'day' }),
});

export function selectTimelineTimeScale(
  scale: TimelineTimeScale,
): TimelineTimeScaleContract {
  return TIMELINE_TIME_SCALE_CONTRACTS[scale];
}

export const TIMELINE_ZOOM_DENSITIES = [
  Object.freeze({ pxPerDay: 3, tickMinSpacing: 56 }),
  Object.freeze({ pxPerDay: 3.8, tickMinSpacing: 44 }),
  Object.freeze({ pxPerDay: 4.6, tickMinSpacing: 30 }),
  Object.freeze({ pxPerDay: 6.2, tickMinSpacing: 24 }),
  Object.freeze({ pxPerDay: 8.4, tickMinSpacing: 20 }),
] as const;

export type TimelineZoomDensity = (typeof TIMELINE_ZOOM_DENSITIES)[number];
export const DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX = 2;
