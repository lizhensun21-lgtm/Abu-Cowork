import type { TimelineHeaderSegment, TimelineHeaderTick } from './header';

export function TimelineHeader({
  canvasWidth,
  segments,
  ticks,
  highlightedMonth,
  todayX,
  todayLabel,
}: {
  canvasWidth: number;
  segments: readonly TimelineHeaderSegment[];
  ticks: readonly TimelineHeaderTick[];
  highlightedMonth: TimelineHeaderSegment | null;
  todayX: number | null;
  todayLabel: string;
}) {
  return (
    <div data-testid="timeline-header" className="timeline-ruler">
      <div className="timeline-ruler-track" style={{ width: canvasWidth }}>
        {todayX !== null ? (
          <span
            data-testid="timeline-today-line-header"
            className="timeline-today-guide timeline-today-guide--header"
            style={{ left: todayX }}
            aria-hidden="true"
          />
        ) : null}
        {highlightedMonth ? (
          <span
            data-testid="timeline-current-month-highlight-header"
            className="timeline-meeting-month-highlight timeline-meeting-month-highlight--header"
            style={{ left: highlightedMonth.left, width: highlightedMonth.width }}
            aria-hidden="true"
          />
        ) : null}
        {segments.map((segment) => (
          <span
            key={segment.key}
            data-testid={`timeline-ruler-segment-${segment.key}`}
            className="timeline-header__segment"
            style={{ left: segment.left + segment.width / 2, width: segment.width }}
          >
            <span>{segment.label}</span>
          </span>
        ))}
        {ticks.map((tick) => (
          <span key={tick.key} className="timeline-header__tick" style={{ left: tick.left }}>
            {tick.label}
          </span>
        ))}
        {todayX !== null ? (
          <span className="today-pill" style={{ left: todayX }}>{todayLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
