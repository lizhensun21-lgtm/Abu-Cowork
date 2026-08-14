import {
  addTimelineDays, createTimelineCoordinates, timelineDaysBetween,
  type TimelineCoordinates, type TimelineRange, type TimelineScale,
} from '@/project-management/timeline';

const TICK_MIN_SPACING: Readonly<Record<TimelineScale, number>> = Object.freeze({
  year: 56, quarter: 44, month: 30, week: 24, day: 20,
});
const MONTH_NAMES = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]);

export interface TimelineHeaderSegment {
  readonly key: string; readonly label: string; readonly left: number; readonly width: number;
}
export interface TimelineHeaderTick {
  readonly key: string; readonly label: string; readonly left: number;
}

function parts(date: string): readonly [number, number, number] {
  return date.split('-').map(Number) as unknown as readonly [number, number, number];
}
function dateKey(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function buildTimelineMonths(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
): readonly TimelineHeaderSegment[] {
  const [startYear, startMonth] = parts(range.startDate);
  const [endYear, endMonth] = parts(range.endDate);
  const segments: TimelineHeaderSegment[] = [];
  let cursor = Date.UTC(startYear, startMonth - 1, 1);
  const lastMonth = Date.UTC(endYear, endMonth - 1, 1);
  while (cursor <= lastMonth) {
    const current = new Date(cursor);
    const year = current.getUTCFullYear();
    const monthIndex = current.getUTCMonth();
    const monthStart = dateKey(year, monthIndex, 1);
    const monthEnd = dateKey(year, monthIndex + 1, 0);
    const visibleStart = monthStart < range.startDate ? range.startDate : monthStart;
    const visibleEnd = monthEnd > range.endDate ? range.endDate : monthEnd;
    const left = coordinates.dateToX(visibleStart);
    const right = coordinates.dateToX(visibleEnd) + coordinates.pxPerDay;
    segments.push(Object.freeze({
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      label: monthIndex === 0 ? `${MONTH_NAMES[monthIndex]} ${year}` : MONTH_NAMES[monthIndex],
      left, width: Math.max(right - left, coordinates.pxPerDay),
    }));
    cursor = Date.UTC(year, monthIndex + 1, 1);
  }
  return Object.freeze(segments);
}

export function buildTimelineTicks(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
  scale: TimelineScale,
  tickMinSpacing = TICK_MIN_SPACING[scale],
): readonly TimelineHeaderTick[] {
  if (scale === 'month') {
    return Object.freeze(buildTimelineMonths(range, coordinates).map((month) => Object.freeze({
      key: month.key, label: '1', left: month.left,
    })));
  }
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  let cursor = addTimelineDays(range.startDate, (8 - start.getUTCDay()) % 7);
  const sampleEveryWeeks = Math.max(1, Math.ceil(tickMinSpacing / (coordinates.pxPerDay * 7)));
  const ticks: TimelineHeaderTick[] = [];
  while (cursor <= range.endDate) {
    const absoluteWeekIndex = Math.round(timelineDaysBetween('1970-01-05', cursor) / 7);
    if (absoluteWeekIndex % sampleEveryWeeks === 0) {
      ticks.push(Object.freeze({ key: cursor, label: String(parts(cursor)[2]), left: coordinates.dateToX(cursor) }));
    }
    cursor = addTimelineDays(cursor, 7);
  }
  return Object.freeze(ticks);
}

export function buildTimelineHeader(
  range: TimelineRange,
  scale: TimelineScale,
  pxPerDay: number,
  tickMinSpacing = TICK_MIN_SPACING[scale],
) {
  const coordinates = createTimelineCoordinates(range.startDate, range.endDate, pxPerDay);
  return Object.freeze({
    coordinates,
    months: buildTimelineMonths(range, coordinates),
    ticks: buildTimelineTicks(range, coordinates, scale, tickMinSpacing),
  });
}
