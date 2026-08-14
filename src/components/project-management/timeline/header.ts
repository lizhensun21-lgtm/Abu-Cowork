import {
  addTimelineDays, createTimelineCoordinates, timelineDaysBetween,
  selectTimelineTimeScale,
  type TimelineCoordinates, type TimelineRange, type TimelineTimeScale,
} from '@/project-management/timeline';
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

function clippedSegment(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
  key: string,
  label: string,
  startDate: string,
  endDate: string,
): TimelineHeaderSegment {
  const visibleStart = startDate < range.startDate ? range.startDate : startDate;
  const visibleEnd = endDate > range.endDate ? range.endDate : endDate;
  const left = coordinates.dateToX(visibleStart);
  const right = coordinates.dateToX(visibleEnd) + coordinates.pxPerDay;
  return Object.freeze({
    key,
    label,
    left,
    width: Math.max(right - left, coordinates.pxPerDay),
  });
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
    segments.push(clippedSegment(
      range,
      coordinates,
      `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      monthIndex === 0 ? `${MONTH_NAMES[monthIndex]} ${year}` : MONTH_NAMES[monthIndex],
      monthStart,
      monthEnd,
    ));
    cursor = Date.UTC(year, monthIndex + 1, 1);
  }
  return Object.freeze(segments);
}

function buildTimelineYears(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
): readonly TimelineHeaderSegment[] {
  const [startYear] = parts(range.startDate);
  const [endYear] = parts(range.endDate);
  const segments: TimelineHeaderSegment[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    segments.push(clippedSegment(
      range,
      coordinates,
      String(year),
      String(year),
      dateKey(year, 0, 1),
      dateKey(year, 11, 31),
    ));
  }
  return Object.freeze(segments);
}

function buildTimelineQuarters(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
): readonly TimelineHeaderSegment[] {
  const [startYear, startMonth] = parts(range.startDate);
  const [endYear, endMonth] = parts(range.endDate);
  const segments: TimelineHeaderSegment[] = [];
  let cursor = Date.UTC(startYear, Math.floor((startMonth - 1) / 3) * 3, 1);
  const lastQuarter = Date.UTC(endYear, Math.floor((endMonth - 1) / 3) * 3, 1);
  while (cursor <= lastQuarter) {
    const current = new Date(cursor);
    const year = current.getUTCFullYear();
    const monthIndex = current.getUTCMonth();
    const quarter = Math.floor(monthIndex / 3) + 1;
    segments.push(clippedSegment(
      range,
      coordinates,
      `${year}-Q${quarter}`,
      `Q${quarter} ${year}`,
      dateKey(year, monthIndex, 1),
      dateKey(year, monthIndex + 3, 0),
    ));
    cursor = Date.UTC(year, monthIndex + 3, 1);
  }
  return Object.freeze(segments);
}

export function buildTimelineSegments(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
  scale: TimelineTimeScale,
): readonly TimelineHeaderSegment[] {
  const { segmentUnit } = selectTimelineTimeScale(scale);
  if (segmentUnit === 'year') return buildTimelineYears(range, coordinates);
  if (segmentUnit === 'quarter') return buildTimelineQuarters(range, coordinates);
  return buildTimelineMonths(range, coordinates);
}

export function buildTimelineTicks(
  range: TimelineRange,
  coordinates: TimelineCoordinates,
  scale: TimelineTimeScale,
  tickMinSpacing = 0,
): readonly TimelineHeaderTick[] {
  const { tickUnit } = selectTimelineTimeScale(scale);
  if (tickUnit === 'year' || tickUnit === 'quarter') {
    const segments = tickUnit === 'year'
      ? buildTimelineYears(range, coordinates)
      : buildTimelineQuarters(range, coordinates);
    return Object.freeze(segments.map((segment) => Object.freeze({
      key: `${segment.key}-tick`,
      label: segment.label,
      left: segment.left,
    })));
  }
  if (tickUnit === 'month') {
    return Object.freeze(buildTimelineMonths(range, coordinates).map((month) => Object.freeze({
      key: month.key, label: '1', left: month.left,
    })));
  }
  if (tickUnit === 'day') {
    const sampleEveryDays = Math.max(1, Math.ceil(tickMinSpacing / coordinates.pxPerDay));
    const ticks: TimelineHeaderTick[] = [];
    let cursor = range.startDate;
    while (cursor <= range.endDate) {
      ticks.push(Object.freeze({
        key: cursor,
        label: String(parts(cursor)[2]),
        left: coordinates.dateToX(cursor),
      }));
      cursor = addTimelineDays(cursor, sampleEveryDays);
    }
    return Object.freeze(ticks);
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
  scale: TimelineTimeScale,
  pxPerDay: number,
  tickMinSpacing = 0,
) {
  const coordinates = createTimelineCoordinates(range.startDate, range.endDate, pxPerDay);
  const months = buildTimelineMonths(range, coordinates);
  return Object.freeze({
    coordinates,
    segments: buildTimelineSegments(range, coordinates, scale),
    months,
    ticks: buildTimelineTicks(range, coordinates, scale, tickMinSpacing),
  });
}
