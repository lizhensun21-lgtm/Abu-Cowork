import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ChevronDown,
  PanelRight,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { useI18n } from '@/i18n';
import type { ProjectGraph } from '@/project-management/domain';
import { getTimelineBarGeometry } from './barGeometry';
import { buildTimelineHeader } from './header';
import { TimelineHeader } from './TimelineHeader';
import { ProjectListRow } from '../ProjectList';
import {
  createProjectOverviewDisplayRows,
  createProjectOverviewViewModel,
  PROJECT_OVERVIEW_BOTTOM_BAR_HEIGHT,
  PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH,
  PROJECT_OVERVIEW_ROW_HEIGHT,
} from '../projectOverviewAdapter';
import '../projectOverview.css';

function localTodayDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface ScrollbarGeometry {
  readonly progress: number;
  readonly thumbWidth: number;
  readonly trackWidth: number;
}

const EMPTY_SCROLLBAR: ScrollbarGeometry = Object.freeze({
  progress: 0,
  thumbWidth: 0,
  trackWidth: 0,
});

const TIMELINE_PAN_THRESHOLD_PX = 5;
const TIMELINE_PAN_BLOCK_SELECTOR = [
  '[data-no-timeline-pan]',
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="menuitem"]',
].join(',');

interface ScrollbarDragGesture {
  startX: number;
  startScrollLeft: number;
  startScrollRange: number;
  active: boolean;
}

interface TimelinePanGesture {
  activePointerId: number | null;
  isPointerDown: boolean;
  isDragging: boolean;
  startClientX: number;
  latestClientX: number;
  startScrollLeft: number;
  animationFrameId: number | null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isTimelinePanBlocked(target: EventTarget | null) {
  return target instanceof Element && target.closest(TIMELINE_PAN_BLOCK_SELECTOR) !== null;
}

function timelinePanScrollLeft(
  startScrollLeft: number,
  startClientX: number,
  currentClientX: number,
) {
  return startScrollLeft - (currentClientX - startClientX);
}

export function TimelineRenderer({ graph, today = localTodayDateKey() }: {
  graph: Readonly<ProjectGraph>;
  today?: string;
}) {
  const { t, locale } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const projectRowsRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<ScrollbarDragGesture>({
    startX: 0,
    startScrollLeft: 0,
    startScrollRange: 0,
    active: false,
  });
  const timelinePanRef = useRef<TimelinePanGesture>({
    activePointerId: null,
    isPointerDown: false,
    isDragging: false,
    startClientX: 0,
    latestClientX: 0,
    startScrollLeft: 0,
    animationFrameId: null,
  });
  const desiredScrollLeftRef = useRef(0);
  const [scrollbar, setScrollbar] = useState<ScrollbarGeometry>(EMPTY_SCROLLBAR);
  const [statusFilter, setStatusFilter] = useState('');
  const [hoveredTimelineId, setHoveredTimelineId] = useState<string | null>(null);
  const viewModel = useMemo(
    () => createProjectOverviewViewModel(graph, today),
    [graph, today],
  );
  const [expandedProjectIds, setExpandedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(
      viewModel.projects
        .filter((project) => project.childTimelines.length > 0)
        .map((project) => project.projectId),
    ),
  );
  const displayRows = useMemo(() => {
    const visibleProjectIds = new Set(viewModel.projects
      .filter((project) => !statusFilter || project.projectStatus === statusFilter)
      .map((project) => project.projectId));
    return createProjectOverviewDisplayRows(viewModel, expandedProjectIds)
      .filter((row) => visibleProjectIds.has(row.project.projectId));
  }, [expandedProjectIds, statusFilter, viewModel]);
  const header = useMemo(
    () => buildTimelineHeader(viewModel.range, viewModel.timeScale, viewModel.pxPerDay),
    [viewModel],
  );
  const todayX = today >= viewModel.range.startDate && today <= viewModel.range.endDate
    ? header.coordinates.dateToX(today)
    : null;
  const highlightedMonth = header.months.find((month) => month.key === today.slice(0, 7)) ?? null;
  const rowsHeight = displayRows.length * PROJECT_OVERVIEW_ROW_HEIGHT;
  const todayLabel = useMemo(() => {
    const [, month, day] = today.split('-').map(Number);
    if (!month || !day) return today;
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
      .format(new Date(2000, month - 1, day));
  }, [locale, today]);

  const updateScrollbar = useCallback(() => {
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    if (!container || !track) return;
    const trackWidth = track.clientWidth;
    const scrollRange = Math.max(container.scrollWidth - container.clientWidth, 0);
    const thumbWidth = container.scrollWidth > 0
      ? Math.max(44, Math.min(trackWidth, trackWidth * container.clientWidth / container.scrollWidth))
      : trackWidth;
    setScrollbar({
      progress: scrollRange > 0 ? container.scrollLeft / scrollRange : 0,
      thumbWidth,
      trackWidth,
    });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (container && projectRowsRef.current) {
      projectRowsRef.current.style.transform = `translateY(${-container.scrollTop}px)`;
    }
    updateScrollbar();
  }, [updateScrollbar]);

  useEffect(() => {
    updateScrollbar();
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    if (!container || !track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(container);
    observer.observe(track);
    return () => observer.disconnect();
  }, [displayRows, updateScrollbar]);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const scrollToToday = useCallback(() => {
    const container = scrollRef.current;
    if (!container || todayX === null) return;
    container.scrollTo({
      left: Math.max(0, todayX - container.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [todayX]);

  const scrollFromTrack = useCallback((clientX: number) => {
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    if (!container || !track) return;
    const rect = track.getBoundingClientRect();
    const travel = Math.max(rect.width - scrollbar.thumbWidth, 0);
    const progress = travel > 0
      ? clamp((clientX - rect.left - scrollbar.thumbWidth / 2) / travel, 0, 1)
      : 0;
    const nextScrollLeft = progress * Math.max(container.scrollWidth - container.clientWidth, 0);
    desiredScrollLeftRef.current = nextScrollLeft;
    container.scrollLeft = nextScrollLeft;
    updateScrollbar();
  }, [scrollbar.thumbWidth, updateScrollbar]);

  const finishTimelinePan = useCallback((commitPendingPosition = true) => {
    const container = scrollRef.current;
    const pan = timelinePanRef.current;
    const pointerId = pan.activePointerId;

    if (pan.animationFrameId !== null) {
      window.cancelAnimationFrame(pan.animationFrameId);
      pan.animationFrameId = null;
      if (commitPendingPosition && pan.isDragging && container) {
        container.scrollLeft = clamp(
          timelinePanScrollLeft(pan.startScrollLeft, pan.startClientX, pan.latestClientX),
          0,
          Math.max(container.scrollWidth - container.clientWidth, 0),
        );
        updateScrollbar();
      }
    }

    pan.activePointerId = null;
    pan.isPointerDown = false;
    pan.isDragging = false;
    pan.startClientX = 0;
    pan.latestClientX = 0;
    pan.startScrollLeft = 0;
    desiredScrollLeftRef.current = container?.scrollLeft ?? 0;
    container?.classList.remove('is-panning');

    if (pointerId !== null && container?.hasPointerCapture(pointerId)) {
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    }
  }, [updateScrollbar]);

  const handleTimelinePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== 'mouse'
      || event.button !== 0
      || !event.isPrimary
      || isTimelinePanBlocked(event.target)
    ) {
      return;
    }

    const container = scrollRef.current;
    const pan = timelinePanRef.current;
    if (!container || pan.isPointerDown || scrollbarDragRef.current.active) return;

    pan.activePointerId = event.pointerId;
    pan.isPointerDown = true;
    pan.isDragging = false;
    pan.startClientX = event.clientX;
    pan.latestClientX = event.clientX;
    pan.startScrollLeft = container.scrollLeft;
    desiredScrollLeftRef.current = container.scrollLeft;
  }, []);

  const handleTimelinePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = timelinePanRef.current;
    if (!pan.isPointerDown || pan.activePointerId !== event.pointerId) return;

    pan.latestClientX = event.clientX;
    const dragDistance = pan.latestClientX - pan.startClientX;
    desiredScrollLeftRef.current = timelinePanScrollLeft(
      pan.startScrollLeft,
      pan.startClientX,
      pan.latestClientX,
    );
    if (!pan.isDragging && Math.abs(dragDistance) <= TIMELINE_PAN_THRESHOLD_PX) return;

    if (!pan.isDragging) {
      pan.isDragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-panning');
      window.getSelection()?.removeAllRanges();
    }

    event.preventDefault();
    if (pan.animationFrameId !== null) return;

    pan.animationFrameId = window.requestAnimationFrame(() => {
      const currentPan = timelinePanRef.current;
      currentPan.animationFrameId = null;
      const container = scrollRef.current;
      if (!container || !currentPan.isPointerDown || !currentPan.isDragging) return;
      container.scrollLeft = clamp(
        desiredScrollLeftRef.current,
        0,
        Math.max(container.scrollWidth - container.clientWidth, 0),
      );
      updateScrollbar();
    });
  }, [updateScrollbar]);

  const handleTimelinePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (timelinePanRef.current.activePointerId === event.pointerId) finishTimelinePan();
  }, [finishTimelinePan]);

  const handleTimelinePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (timelinePanRef.current.activePointerId === event.pointerId) finishTimelinePan(false);
  }, [finishTimelinePan]);

  return (
    <section
      data-project-overview-workspace
      data-testid="project-timeline-workspace"
      data-no-window-drag
      data-timeline-scale={viewModel.timeScale}
      data-timeline-start-date={viewModel.range.startDate}
      data-timeline-end-date={viewModel.range.endDate}
      className="timeline-card main-workspace is-read-only"
      aria-label={t.sidebar.projectManagement}
    >
      <div className="timeline-titlebar">
        <div className="timeline-titlebar__identity">
          <h2>{t.projectManagement.workspaceTitle}</h2>
        </div>
      </div>
      <div className="timeline-toolbar">
        <div className="timeline-toolbar__left">
          <div className="project-filter-bar" role="group" aria-label={t.projectManagement.projectFilters}>
            <select
              className="project-filter-select project-filter-select--category"
              aria-label={t.projectManagement.productCategory}
              title={t.projectManagement.filterUnavailable}
              disabled
            >
              <option>{t.projectManagement.allCategories}</option>
            </select>
            <select
              className="project-filter-select project-filter-select--model"
              aria-label={t.projectManagement.productModel}
              title={t.projectManagement.filterUnavailable}
              disabled
            >
              <option>{t.projectManagement.allModels}</option>
            </select>
            <select
              className={`project-filter-select project-filter-select--status${statusFilter ? ' is-active' : ''}`}
              aria-label={t.projectManagement.projectStatus}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">{t.projectManagement.allStatuses}</option>
              <option value="planning">{t.projectManagement.statusPlanning}</option>
              <option value="active">{t.projectManagement.statusActive}</option>
              <option value="paused">{t.projectManagement.statusPaused}</option>
              <option value="closed">{t.projectManagement.statusClosed}</option>
              <option value="cancelled">{t.projectManagement.statusCancelled}</option>
            </select>
          </div>
        </div>
        <div className="timeline-toolbar__right">
          <div className="timeline-toolbar__icon-group">
            <div className="timeline-zoom-control-group" role="group" aria-label={t.projectManagement.timelineZoom}>
              <button type="button" className="icon-button icon-button--plain timeline-zoom-button" disabled title={t.projectManagement.zoomUnavailable} aria-label={t.projectManagement.zoomOut}>
                <ZoomOut size={14} aria-hidden="true" />
              </button>
              <button type="button" className="icon-button icon-button--plain timeline-zoom-button" disabled title={t.projectManagement.zoomUnavailable} aria-label={t.projectManagement.zoomIn}>
                <ZoomIn size={14} aria-hidden="true" />
              </button>
            </div>
            <button type="button" className="icon-button icon-button--plain" disabled title={t.projectManagement.controlsUnavailable} aria-label={t.projectManagement.timelineDensity}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span className="tool-status-dot" aria-hidden="true" />
            </button>
            <button type="button" className="icon-button icon-button--plain" disabled title={t.projectManagement.controlsUnavailable} aria-label={t.projectManagement.panelSettings}>
              <PanelRight size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="timeline-toolbar__view-group">
            <button
              type="button"
              className="today-button"
              onClick={scrollToToday}
              disabled={todayX === null}
            >
              {t.projectManagement.today}
            </button>
            <div className="scale-menu-wrap">
              <button
                type="button"
                className="scale-button"
                disabled
                title={t.projectManagement.scaleUnavailable}
                aria-label={t.projectManagement.timelineScale}
                aria-expanded="false"
              >
                {t.projectManagement.annualView}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        className="continuous-time-canvas"
        style={{
          '--project-label-width': `${PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH}px`,
          '--workspace-bottom-bar-height': `${PROJECT_OVERVIEW_BOTTOM_BAR_HEIGHT}px`,
        } as CSSProperties}
      >
        <div className="project-panel">
          <div className="project-panel__ruler-spacer" />
          <div ref={projectRowsRef} className="project-panel__rows" style={{ minHeight: rowsHeight }}>
            {displayRows.map((row) => (
              <ProjectListRow
                key={row.key}
                row={row}
                expanded={expandedProjectIds.has(row.project.projectId)}
                onToggleExpanded={toggleProject}
                hovered={hoveredTimelineId === row.timeline.timelineId}
                onHoverTimeline={setHoveredTimelineId}
              />
            ))}
          </div>
        </div>
        <div className="timeline-scroll-region">
          {viewModel.projects.length === 0 ? (
            <div className="timeline-empty-state" role="status">
              <strong>{t.projectManagement.empty}</strong>
            </div>
          ) : null}
          <div
            ref={scrollRef}
            className="timeline-scroll-container"
            data-testid="timeline-scroll-container"
            onScroll={handleScroll}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerCancel}
            onLostPointerCapture={handleTimelinePointerCancel}
            onDragStart={(event) => {
              if (timelinePanRef.current.isPointerDown) event.preventDefault();
            }}
          >
            <TimelineHeader
              canvasWidth={header.coordinates.canvasWidth}
              months={header.months}
              ticks={header.ticks}
              highlightedMonth={highlightedMonth}
              todayX={todayX}
              todayLabel={todayLabel}
            />
            <div
              className="workspace-body"
              data-testid="timeline-workspace-body"
              style={{ width: header.coordinates.canvasWidth, minHeight: rowsHeight }}
            >
              <div className="timeline-grid" data-testid="timeline-grid">
                <div className="timeline-background">
                  {highlightedMonth ? (
                    <span
                      data-testid="timeline-current-month-highlight-body"
                      className="timeline-meeting-month-highlight timeline-meeting-month-highlight--body"
                      style={{ left: highlightedMonth.left, width: highlightedMonth.width }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {header.months.map((month) => (
                    <span
                      key={month.key}
                      className="timeline-major-grid-line"
                      style={{ left: month.left }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                {todayX !== null ? (
                  <span
                    data-testid="timeline-today-line-body"
                    className="timeline-today-guide timeline-today-guide--body"
                    style={{ left: todayX }}
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  className="project-timeline-rows"
                  data-testid="project-timeline-rows"
                  style={{ height: rowsHeight }}
                >
                {displayRows.map((row, index) => {
                  const geometry = getTimelineBarGeometry(row.timeline, header.coordinates);
                  return (
                    <div
                      key={row.key}
                      data-testid={`timeline-layout-row-${row.key}`}
                      data-project-id={row.project.projectId}
                      data-timeline-id={row.timeline.timelineId}
                      className="timeline-lane"
                      style={{ top: index * PROJECT_OVERVIEW_ROW_HEIGHT }}
                      onPointerEnter={() => setHoveredTimelineId(row.timeline.timelineId)}
                      onPointerLeave={() => setHoveredTimelineId(null)}
                    >
                      {geometry ? (
                        <span
                          data-testid={`timeline-bar-${row.timeline.timelineId}`}
                          data-no-timeline-pan
                          className={`timeline-lane__bar${
                            hoveredTimelineId === row.timeline.timelineId ? ' is-project-hovered' : ''
                          }`}
                          style={geometry}
                          title={`${row.timeline.label}: ${row.timeline.startDate} — ${row.timeline.endDate}`}
                        />
                      ) : null}
                      {row.timeline.milestones.map((milestone) => (
                        <span
                          key={milestone.id}
                          data-milestone-id={milestone.id}
                          data-no-timeline-pan
                          className="milestone-node"
                          style={{ left: header.coordinates.dateToX(milestone.date) }}
                          title={`${milestone.name} · ${milestone.date}`}
                        >
                          <svg className="milestone-diamond" viewBox="0 0 10 13" aria-hidden="true">
                            <polygon points="5,0.7 9.3,6.5 5,12.3 0.7,6.5" />
                          </svg>
                          <span className="milestone-node__label">{milestone.name}</span>
                        </span>
                      ))}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="timeline-bottom-bar">
          <div
            ref={scrollbarRef}
            className="timeline-custom-scrollbar"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) scrollFromTrack(event.clientX);
            }}
          >
            <div
              role="scrollbar"
              tabIndex={0}
              aria-label="Timeline horizontal scroll"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scrollbar.progress * 100)}
              className="timeline-custom-scrollbar__thumb"
              data-testid="timeline-custom-scrollbar-thumb"
              style={{
                width: scrollbar.thumbWidth,
                left: scrollbar.progress * Math.max(scrollbar.trackWidth - scrollbar.thumbWidth, 0),
              }}
              onPointerDown={(event) => {
                const container = scrollRef.current;
                if (!container) return;
                scrollbarDragRef.current = {
                  startX: event.clientX,
                  startScrollLeft: container.scrollLeft,
                  startScrollRange: Math.max(container.scrollWidth - container.clientWidth, 0),
                  active: true,
                };
                desiredScrollLeftRef.current = container.scrollLeft;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const container = scrollRef.current;
                const track = scrollbarRef.current;
                const drag = scrollbarDragRef.current;
                if (!container || !track || !drag.active) return;
                const travel = track.getBoundingClientRect().width - scrollbar.thumbWidth;
                if (travel <= 0) return;
                const nextScrollLeft = drag.startScrollLeft
                  + ((event.clientX - drag.startX) / travel) * drag.startScrollRange;
                desiredScrollLeftRef.current = nextScrollLeft;
                container.scrollLeft = clamp(
                  nextScrollLeft,
                  0,
                  Math.max(container.scrollWidth - container.clientWidth, 0),
                );
                updateScrollbar();
              }}
              onPointerUp={(event) => {
                scrollbarDragRef.current.active = false;
                desiredScrollLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                scrollbarDragRef.current.active = false;
                desiredScrollLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
              }}
              onKeyDown={(event) => {
                const container = scrollRef.current;
                if (!container || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
                event.preventDefault();
                container.scrollBy({
                  left: event.key === 'ArrowLeft' ? -80 : 80,
                  behavior: 'smooth',
                });
              }}
            />
          </div>
        </div>
        <div className="project-overview-drawer-slot" aria-hidden="true" />
        <div className="project-overview-overlay-slot" aria-hidden="true" />
      </div>
    </section>
  );
}
