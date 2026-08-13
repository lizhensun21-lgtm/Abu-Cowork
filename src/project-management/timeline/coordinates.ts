import { isCanonicalDomainDate } from '../domain/projectGraph';

const MILLISECONDS_PER_DAY = 86_400_000;

export interface TimelineCoordinates {
  readonly startDate: string;
  readonly endDate: string;
  /** Horizontal density measured in pixels per calendar day. */
  readonly pxPerDay: number;
  /** Timeline canvas width measured in pixels. */
  readonly canvasWidth: number;
  /** Converts a YYYY-MM-DD calendar date to a clamped x coordinate in pixels. */
  dateToX(date: string): number;
  /** Converts a clamped x coordinate in pixels to a YYYY-MM-DD calendar date. */
  xToDate(x: number): string;
}

function assertCalendarDate(date: string): void {
  if (!isCanonicalDomainDate(date)) {
    throw new Error(`Timeline date must use YYYY-MM-DD: ${date}`);
  }
}

function dateOrdinal(date: string): number {
  assertCalendarDate(date);
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY);
}

function dateFromOrdinal(ordinal: number): string {
  return new Date(ordinal * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

export function timelineDaysBetween(startDate: string, endDate: string): number {
  return dateOrdinal(endDate) - dateOrdinal(startDate);
}

export function addTimelineDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('Timeline day offset must be an integer');
  return dateFromOrdinal(dateOrdinal(date) + days);
}

export function addTimelineMonths(date: string, months: number): string {
  assertCalendarDate(date);
  if (!Number.isInteger(months)) throw new Error('Timeline month offset must be an integer');
  const [year, month, day] = date.split('-').map(Number);
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetMonthEnd = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  ));
  targetMonthStart.setUTCDate(Math.min(day, targetMonthEnd.getUTCDate()));
  return targetMonthStart.toISOString().slice(0, 10);
}

export function createTimelineCoordinates(
  startDate: string,
  endDate: string,
  pxPerDay: number,
): TimelineCoordinates {
  const totalDays = timelineDaysBetween(startDate, endDate);
  if (totalDays < 0) throw new Error('Timeline startDate must not be after endDate');
  if (!Number.isFinite(pxPerDay) || pxPerDay <= 0) {
    throw new Error('Timeline pxPerDay must be a positive finite number');
  }
  const canvasWidth = Math.max(totalDays, 1) * pxPerDay;
  const startOrdinal = dateOrdinal(startDate);
  const clampX = (x: number) => Math.min(Math.max(x, 0), canvasWidth);
  const clampDay = (day: number) => Math.min(Math.max(day, 0), totalDays);

  return Object.freeze({
    startDate,
    endDate,
    pxPerDay,
    canvasWidth,
    dateToX(date: string) {
      return clampDay(timelineDaysBetween(startDate, date)) * pxPerDay;
    },
    xToDate(x: number) {
      if (!Number.isFinite(x)) throw new Error('Timeline x must be a finite pixel value');
      return dateFromOrdinal(startOrdinal + clampDay(Math.round(clampX(x) / pxPerDay)));
    },
  });
}
