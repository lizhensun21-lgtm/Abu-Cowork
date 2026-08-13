import { Fragment, useMemo } from 'react';

import { useI18n } from '@/i18n';
import { selectProjectListRows } from '@/project-management/application';
import type { ProjectGraph } from '@/project-management/domain';
import { deriveTimelineRange, selectTimelineRows, selectTimelineScale } from '@/project-management/timeline';
import { ProjectListRow } from '../ProjectList';
import { getTimelineBarGeometry } from './barGeometry';
import { buildTimelineHeader } from './header';
import { createProjectManagementLayoutRows, PROJECT_LIST_COLUMN_WIDTH, TIMELINE_HEADER_HEIGHT } from './rowLayout';
import { TimelineHeader } from './TimelineHeader';

const DEFAULT_TIMELINE_SCALE = 'month' as const;
const FALLBACK_RANGE = Object.freeze({ startDate: '2026-01-01', endDate: '2026-12-31' });

function localTodayDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TimelineRenderer({ graph, today = localTodayDateKey() }: {
  graph: Readonly<ProjectGraph>;
  today?: string;
}) {
  const { t } = useI18n();
  const view = useMemo(() => {
    const projects = selectProjectListRows(graph);
    const timelines = selectTimelineRows(graph);
    const layoutRows = createProjectManagementLayoutRows(projects, timelines);
    const range = deriveTimelineRange(timelines, FALLBACK_RANGE);
    const scale = selectTimelineScale(DEFAULT_TIMELINE_SCALE);
    const header = buildTimelineHeader(range, scale.scale, scale.pxPerDay);
    return { layoutRows, range, ...header };
  }, [graph]);
  const todayX = today >= view.range.startDate && today <= view.range.endDate
    ? view.coordinates.dateToX(today)
    : null;
  const contentWidth = PROJECT_LIST_COLUMN_WIDTH + view.coordinates.canvasWidth;

  return (
    <div data-testid="project-timeline-workspace" data-no-window-drag data-timeline-scale={DEFAULT_TIMELINE_SCALE} data-timeline-start-date={view.range.startDate} data-timeline-end-date={view.range.endDate} className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--abu-border)] bg-[var(--abu-bg-base)] [-webkit-app-region:no-drag]">
      <div className="grid min-h-full" style={{ width: contentWidth, gridTemplateColumns: `${PROJECT_LIST_COLUMN_WIDTH}px ${view.coordinates.canvasWidth}px` }}>
        <div className="sticky left-0 top-0 z-30 border-b border-r border-[var(--abu-border)] bg-[var(--abu-bg-canvas)] px-4 text-minor font-medium leading-[48px] text-[var(--abu-text-muted)]" style={{ height: TIMELINE_HEADER_HEIGHT }}>
          {t.projectManagement.projectName}
        </div>
        <TimelineHeader canvasWidth={view.coordinates.canvasWidth} months={view.months} ticks={view.ticks} todayX={todayX} />
        {view.layoutRows.map((row) => (
          <Fragment key={row.key}>
            <ProjectListRow row={row} />
            <div data-testid={`timeline-layout-row-${row.key}`} data-row-kind={row.kind} className="relative border-b border-[var(--abu-border-subtle)]" style={{ height: row.height, width: view.coordinates.canvasWidth }}>
              {view.months.map((month) => <span key={month.key} aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--abu-border-subtle)]" style={{ left: month.left }} />)}
              {todayX !== null ? <span data-testid={`timeline-today-line-${row.key}`} aria-hidden="true" className="absolute inset-y-0 z-10 w-px bg-[var(--abu-clay-50)]" style={{ left: todayX }} /> : null}
              {row.kind === 'timeline' && getTimelineBarGeometry(row.timeline, view.coordinates) ? <span
                data-testid={`timeline-bar-${row.timeline.timelineId}`}
                data-project-id={row.timeline.projectId}
                data-timeline-id={row.timeline.timelineId}
                className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded border border-[var(--abu-clay-60)] bg-[var(--abu-clay-bg)]"
                style={getTimelineBarGeometry(row.timeline, view.coordinates) ?? undefined}
                title={`${row.timeline.label}: ${row.timeline.startDate} – ${row.timeline.endDate}`}
              /> : null}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
