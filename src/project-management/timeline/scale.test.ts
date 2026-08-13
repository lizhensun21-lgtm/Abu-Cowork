import { describe, expect, it } from 'vitest';
import { TIMELINE_SCALES, selectTimelineScale } from './scale';

describe('Timeline scale contract', () => {
  it('maps every supported scale to the verified pixel density', () => {
    expect(TIMELINE_SCALES).toEqual(['year', 'quarter', 'month', 'week', 'day']);
    expect(TIMELINE_SCALES.map((scale) => selectTimelineScale(scale).pxPerDay))
      .toEqual([3, 3.8, 4.6, 6.2, 8.4]);
  });

  it('exposes immutable scale contracts', () => {
    expect(Object.isFrozen(selectTimelineScale('month'))).toBe(true);
  });
});
