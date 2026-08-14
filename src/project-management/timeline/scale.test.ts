import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMELINE_TIME_SCALE,
  DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX,
  TIMELINE_TIME_SCALES,
  TIMELINE_ZOOM_DENSITIES,
  selectTimelineTimeScale,
} from './scale';

describe('Timeline density and time scale contracts', () => {
  it('keeps the five Web zoom densities independent from time scale', () => {
    expect(TIMELINE_ZOOM_DENSITIES.map(({ pxPerDay }) => pxPerDay))
      .toEqual([3, 3.8, 4.6, 6.2, 8.4]);
    expect(DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX).toBe(2);
    expect(TIMELINE_ZOOM_DENSITIES[DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX].pxPerDay).toBe(4.6);
    expect(TIMELINE_ZOOM_DENSITIES.every((density) => !('scale' in density))).toBe(true);
  });

  it('defines immutable ruler presentation for every formal time scale', () => {
    expect(TIMELINE_TIME_SCALES).toEqual(['year', 'quarter', 'month', 'week', 'day']);
    expect(DEFAULT_TIMELINE_TIME_SCALE).toBe('week');
    expect(TIMELINE_TIME_SCALES.map((scale) => selectTimelineTimeScale(scale))).toEqual([
      { scale: 'year', segmentUnit: 'year', tickUnit: 'year' },
      { scale: 'quarter', segmentUnit: 'quarter', tickUnit: 'quarter' },
      { scale: 'month', segmentUnit: 'month', tickUnit: 'month' },
      { scale: 'week', segmentUnit: 'month', tickUnit: 'week' },
      { scale: 'day', segmentUnit: 'month', tickUnit: 'day' },
    ]);
    expect(Object.isFrozen(selectTimelineTimeScale('month'))).toBe(true);
  });
});
