import { describe, expect, it } from 'vitest';
import { deriveTimelineRange, extendTimelineRangeToIncludeDate } from './range';

describe('Timeline range contract', () => {
  it('derives month-aligned padding from actual row bounds', () => {
    expect(deriveTimelineRange([
      { startDate: '2026-03-15', endDate: '2026-08-09' },
      { startDate: '2026-01-20', endDate: '2026-11-02' },
    ], { startDate: '2025-01-01', endDate: '2027-12-31' })).toEqual({
      startDate: '2025-11-01',
      endDate: '2027-01-31',
    });
  });

  it('keeps the explicit fallback for zero rows', () => {
    expect(deriveTimelineRange([], {
      startDate: '2026-01-01', endDate: '2026-12-31',
    })).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
  });

  it('extends only the required edge until the target date is included', () => {
    expect(extendTimelineRangeToIncludeDate(
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      '2024-11-15',
      { pastMonths: 12, futureMonths: 12 },
    )).toEqual({ startDate: '2024-01-01', endDate: '2026-12-31' });
    expect(extendTimelineRangeToIncludeDate(
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      '2028-01-01',
      { pastMonths: 12, futureMonths: 12 },
    )).toEqual({ startDate: '2026-01-01', endDate: '2028-12-31' });
  });

  it('rejects invalid fallback, row, target, and extension inputs', () => {
    expect(() => deriveTimelineRange([], {
      startDate: '2026-02-30', endDate: '2026-12-31',
    })).toThrow();
    expect(() => deriveTimelineRange([
      { startDate: '2026-12-31', endDate: '2026-01-01' },
    ], { startDate: '2026-01-01', endDate: '2026-12-31' })).toThrow();
    expect(() => extendTimelineRangeToIncludeDate(
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      'not-a-date',
      { pastMonths: 12, futureMonths: 12 },
    )).toThrow();
  });
});
