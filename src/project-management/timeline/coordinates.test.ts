import { describe, expect, it } from 'vitest';
import {
  addTimelineDays,
  addTimelineMonths,
  createTimelineCoordinates,
  timelineDaysBetween,
} from './coordinates';

describe('Timeline calendar coordinates', () => {
  it('maps calendar dates to pixels at different densities', () => {
    for (const pxPerDay of [3, 4.6, 6.2, 8.4]) {
      const coordinates = createTimelineCoordinates('2026-03-01', '2026-03-31', pxPerDay);
      expect(coordinates.dateToX('2026-03-11')).toBeCloseTo(10 * pxPerDay);
      expect(coordinates.xToDate(10 * pxPerDay)).toBe('2026-03-11');
    }
  });

  it('round-trips leap-day and daylight-saving boundaries without local timezone drift', () => {
    const coordinates = createTimelineCoordinates('2024-02-01', '2026-12-31', 4.6);
    for (const date of ['2024-02-29', '2026-03-08', '2026-11-01']) {
      expect(coordinates.xToDate(coordinates.dateToX(date))).toBe(date);
    }
    expect(timelineDaysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('uses calendar-safe day and month arithmetic', () => {
    expect(addTimelineDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addTimelineMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addTimelineMonths('2025-01-31', 1)).toBe('2025-02-28');
  });

  it('rejects invalid dates, ranges, density, and coordinates', () => {
    expect(() => createTimelineCoordinates('2026-02-30', '2026-03-01', 4.6)).toThrow();
    expect(() => createTimelineCoordinates('2026-03-02', '2026-03-01', 4.6)).toThrow();
    expect(() => createTimelineCoordinates('2026-03-01', '2026-03-02', 0)).toThrow();
    expect(() => createTimelineCoordinates('2026-03-01', '2026-03-02', 4.6).xToDate(Infinity)).toThrow();
  });
});
