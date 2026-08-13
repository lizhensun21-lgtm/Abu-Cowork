import type { TimelineHeaderSegment, TimelineHeaderTick } from './header';
import { TIMELINE_HEADER_HEIGHT } from './rowLayout';

export function TimelineHeader({ canvasWidth, months, ticks, todayX }: {
  canvasWidth: number;
  months: readonly TimelineHeaderSegment[];
  ticks: readonly TimelineHeaderTick[];
  todayX: number | null;
}) {
  return (
    <div data-testid="timeline-header" className="sticky top-0 z-20 border-b border-[var(--abu-border)] bg-[var(--abu-bg-canvas)]" style={{ width: canvasWidth, height: TIMELINE_HEADER_HEIGHT }}>
      {months.map((month) => (
        <div key={month.key} data-testid={`timeline-month-${month.key}`} className="absolute top-0 h-6 border-l border-[var(--abu-border-subtle)] px-2 text-center text-minor font-semibold leading-6 tracking-tight text-[var(--abu-text-secondary)]" style={{ left: month.left, width: month.width }}>
          {month.label}
        </div>
      ))}
      {ticks.map((tick) => (
        <span key={tick.key} className="absolute top-6 h-6 -translate-x-1/2 px-1 text-caption leading-6 tabular-nums text-[var(--abu-text-muted)]" style={{ left: tick.left }}>
          {tick.label}
        </span>
      ))}
      {todayX !== null ? <span data-testid="timeline-today-line-header" aria-hidden="true" className="absolute inset-y-0 z-10 w-px bg-[var(--abu-clay-50)]" style={{ left: todayX }} /> : null}
    </div>
  );
}
