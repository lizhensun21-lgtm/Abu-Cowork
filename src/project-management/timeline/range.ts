import { addTimelineMonths, timelineDaysBetween } from './coordinates';

export interface TimelineRange {
  readonly startDate: string;
  readonly endDate: string;
}

export interface TimelineRangePadding {
  readonly pastMonths: number;
  readonly futureMonths: number;
}

export interface TimelineScrollMetrics {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

export interface TimelineExtensionEdges {
  readonly left: boolean;
  readonly right: boolean;
}

export const TIMELINE_RANGE_EXTENSION_MONTHS = 12;
export const TIMELINE_RANGE_EDGE_THRESHOLD_RATIO = 0.2;

const DEFAULT_RANGE_PADDING: TimelineRangePadding = Object.freeze({
  pastMonths: 2,
  futureMonths: 2,
});

function monthStart(date: string, offset: number): string {
  return `${addTimelineMonths(`${date.slice(0, 7)}-01`, offset).slice(0, 7)}-01`;
}

function monthEnd(date: string, offset: number): string {
  const nextMonth = monthStart(date, offset + 1);
  return new Date(Date.UTC(
    Number(nextMonth.slice(0, 4)),
    Number(nextMonth.slice(5, 7)) - 1,
    0,
  )).toISOString().slice(0, 10);
}

function assertPadding(padding: TimelineRangePadding): void {
  if (!Number.isInteger(padding.pastMonths) || padding.pastMonths < 0
    || !Number.isInteger(padding.futureMonths) || padding.futureMonths < 0) {
    throw new Error('Timeline range padding must use non-negative whole months');
  }
}

export function deriveTimelineRange(
  rows: readonly Pick<TimelineRange, 'startDate' | 'endDate'>[],
  fallback: TimelineRange,
  padding: TimelineRangePadding = DEFAULT_RANGE_PADDING,
): TimelineRange {
  assertPadding(padding);
  if (timelineDaysBetween(fallback.startDate, fallback.endDate) < 0) {
    throw new Error('Timeline fallback range is invalid');
  }
  if (rows.length === 0) return Object.freeze({ ...fallback });
  for (const row of rows) {
    if (timelineDaysBetween(row.startDate, row.endDate) < 0) {
      throw new Error('Timeline row range is invalid');
    }
  }
  const earliestStart = rows.reduce(
    (earliest, row) => row.startDate < earliest ? row.startDate : earliest,
    rows[0].startDate,
  );
  const latestEnd = rows.reduce(
    (latest, row) => row.endDate > latest ? row.endDate : latest,
    rows[0].endDate,
  );
  return Object.freeze({
    startDate: monthStart(earliestStart, -padding.pastMonths),
    endDate: monthEnd(latestEnd, padding.futureMonths),
  });
}

export function extendTimelineRangeToIncludeDate(
  range: TimelineRange,
  targetDate: string,
  extension: TimelineRangePadding,
): TimelineRange {
  assertPadding(extension);
  if (timelineDaysBetween(range.startDate, range.endDate) < 0) {
    throw new Error('Timeline range is invalid');
  }
  timelineDaysBetween(range.startDate, targetDate);
  if (extension.pastMonths === 0 && targetDate < range.startDate) {
    throw new Error('Past range extension must be greater than zero');
  }
  if (extension.futureMonths === 0 && targetDate > range.endDate) {
    throw new Error('Future range extension must be greater than zero');
  }
  let startDate = range.startDate;
  let endDate = range.endDate;
  while (targetDate < startDate) startDate = addTimelineMonths(startDate, -extension.pastMonths);
  while (targetDate > endDate) endDate = addTimelineMonths(endDate, extension.futureMonths);
  return Object.freeze({ startDate, endDate });
}

export function timelineExtensionEdges(
  metrics: TimelineScrollMetrics,
  thresholdRatio: number,
  desiredScrollLeft = metrics.scrollLeft,
): TimelineExtensionEdges {
  if (!Number.isFinite(thresholdRatio) || thresholdRatio < 0) {
    throw new Error('Timeline extension threshold ratio must be non-negative');
  }
  const threshold = metrics.clientWidth * thresholdRatio;
  const maxScrollLeft = Math.max(metrics.scrollWidth - metrics.clientWidth, 0);
  return Object.freeze({
    left: desiredScrollLeft < threshold || metrics.scrollLeft < threshold,
    right:
      desiredScrollLeft > maxScrollLeft - threshold
      || maxScrollLeft - metrics.scrollLeft < threshold,
  });
}

export function compensatePrependScrollLeft(scrollLeft: number, prependWidth: number): number {
  return scrollLeft + prependWidth;
}
