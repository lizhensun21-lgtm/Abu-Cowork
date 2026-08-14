import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
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
import {
  addTimelineMonths,
  compensatePrependScrollLeft,
  DEFAULT_TIMELINE_TIME_SCALE,
  DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX,
  extendTimelineRangeToIncludeDate,
  timelineDaysBetween,
  timelineExtensionEdges,
  TIMELINE_RANGE_EDGE_THRESHOLD_RATIO,
  TIMELINE_RANGE_EXTENSION_MONTHS,
  TIMELINE_TIME_SCALES,
  TIMELINE_ZOOM_DENSITIES,
  type TimelineRange,
  type TimelineTimeScale,
} from '@/project-management/timeline';
import { getTimelineBarGeometry } from './barGeometry';
import { buildTimelineHeader } from './header';
import { TimelineHeader } from './TimelineHeader';
import { TimelineMilestones } from './TimelineMilestones';
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
const TIMELINE_WHEEL_ZOOM_THROTTLE_MS = 180;
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
  latestX: number;
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

interface PendingZoomAnchor {
  anchorDate: string;
  anchorClientX: number;
}

interface PendingLeftExtension {
  previousScrollLeft: number;
  previousDesiredScrollLeft: number;
  prependWidth: number;
}

interface PendingRightExtension {
  previousScrollLeft: number;
  previousDesiredScrollLeft: number;
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

export function TimelineRenderer({ graph, today = localTodayDateKey(), initialFocusDate }: {
  graph: Readonly<ProjectGraph>;
  today?: string;
  initialFocusDate?: string;
}) {
  const { t, locale } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const projectRowsRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<ScrollbarDragGesture>({
    startX: 0,
    latestX: 0,
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
  const pendingZoomAnchorRef = useRef<PendingZoomAnchor | null>(null);
  const pendingLeftExtensionRef = useRef<PendingLeftExtension | null>(null);
  const pendingRightExtensionRef = useRef<PendingRightExtension | null>(null);
  const pendingTodayScrollBehaviorRef = useRef<ScrollBehavior | null>(null);
  const isExtendingLeftRef = useRef(false);
  const isExtendingRightRef = useRef(false);
  const isNavigatingToTodayRef = useRef(false);
  const isZoomingRef = useRef(false);
  const didInitializeFocusRef = useRef(false);
  const timelineStartDateRef = useRef('');
  const timelinePxPerDayRef = useRef(0);
  const leftExtensionReleaseFrameRef = useRef<number | null>(null);
  const rightExtensionReleaseFrameRef = useRef<number | null>(null);
  const zoomReleaseFrameRef = useRef<number | null>(null);
  const todayNavigationReleaseTimerRef = useRef<number | null>(null);
  const wheelZoomLockedRef = useRef(false);
  const wheelZoomReleaseTimerRef = useRef<number | null>(null);
  const desiredScrollLeftRef = useRef(0);
  const [scrollbar, setScrollbar] = useState<ScrollbarGeometry>(EMPTY_SCROLLBAR);
  const [zoomLevelIndex, setZoomLevelIndex] = useState(DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX);
  const [timeScale, setTimeScale] = useState<TimelineTimeScale>(DEFAULT_TIMELINE_TIME_SCALE);
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [hoveredTimelineId, setHoveredTimelineId] = useState<string | null>(null);
  const viewModel = useMemo(
    () => createProjectOverviewViewModel(graph, today),
    [graph, today],
  );
  const initialTimelineRange = useMemo(
    () => extendTimelineRangeToIncludeDate(
      viewModel.range,
      initialFocusDate ?? today,
      {
        pastMonths: TIMELINE_RANGE_EXTENSION_MONTHS,
        futureMonths: TIMELINE_RANGE_EXTENSION_MONTHS,
      },
    ),
    [initialFocusDate, today, viewModel.range],
  );
  const [timelineRange, setTimelineRange] = useState<TimelineRange>(() => initialTimelineRange);
  const observedProjectRangeRef = useRef(viewModel.range);
  useEffect(() => {
    if (
      observedProjectRangeRef.current.startDate === viewModel.range.startDate
      && observedProjectRangeRef.current.endDate === viewModel.range.endDate
    ) return;
    observedProjectRangeRef.current = viewModel.range;
    setTimelineRange((current) => ({
      startDate: viewModel.range.startDate < current.startDate
        ? viewModel.range.startDate
        : current.startDate,
      endDate: viewModel.range.endDate > current.endDate
        ? viewModel.range.endDate
        : current.endDate,
    }));
  }, [viewModel.range]);
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
  const zoomLevel = TIMELINE_ZOOM_DENSITIES[zoomLevelIndex];
  const pxPerDay = zoomLevel.pxPerDay;
  const header = useMemo(
    () => buildTimelineHeader(
      timelineRange,
      timeScale,
      pxPerDay,
      zoomLevel.tickMinSpacing,
    ),
    [pxPerDay, timeScale, timelineRange, zoomLevel.tickMinSpacing],
  );
  const todayX = today >= timelineRange.startDate && today <= timelineRange.endDate
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

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    timelineStartDateRef.current = timelineRange.startDate;
    timelinePxPerDayRef.current = pxPerDay;
  }, [pxPerDay, timelineRange.startDate]);

  const checkAndExtendTimeline = useCallback((
    currentScrollLeft: number,
    desiredScrollLeft = currentScrollLeft,
  ) => {
    const container = scrollRef.current;
    if (
      !container
      || isNavigatingToTodayRef.current
      || isZoomingRef.current
    ) return;

    const edges = timelineExtensionEdges({
      scrollLeft: currentScrollLeft,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
    }, TIMELINE_RANGE_EDGE_THRESHOLD_RATIO, desiredScrollLeft);

    if (edges.left && !isExtendingLeftRef.current) {
      const previousStartDate = timelineStartDateRef.current;
      const nextStartDate = addTimelineMonths(
        previousStartDate,
        -TIMELINE_RANGE_EXTENSION_MONTHS,
      );
      isExtendingLeftRef.current = true;
      pendingLeftExtensionRef.current = {
        previousScrollLeft: currentScrollLeft,
        previousDesiredScrollLeft: desiredScrollLeft,
        prependWidth:
          timelineDaysBetween(nextStartDate, previousStartDate)
          * timelinePxPerDayRef.current,
      };
      setTimelineRange((current) => ({ ...current, startDate: nextStartDate }));
    }

    if (edges.right && !isExtendingRightRef.current) {
      isExtendingRightRef.current = true;
      pendingRightExtensionRef.current = {
        previousScrollLeft: currentScrollLeft,
        previousDesiredScrollLeft: desiredScrollLeft,
      };
      setTimelineRange((current) => ({
        ...current,
        endDate: addTimelineMonths(current.endDate, TIMELINE_RANGE_EXTENSION_MONTHS),
      }));
    }
  }, []);

  const scheduleTodayNavigationRelease = useCallback((behavior: ScrollBehavior) => {
    if (todayNavigationReleaseTimerRef.current !== null) {
      window.clearTimeout(todayNavigationReleaseTimerRef.current);
    }
    if (behavior !== 'smooth') {
      isNavigatingToTodayRef.current = false;
      todayNavigationReleaseTimerRef.current = null;
      return;
    }
    todayNavigationReleaseTimerRef.current = window.setTimeout(() => {
      isNavigatingToTodayRef.current = false;
      todayNavigationReleaseTimerRef.current = null;
    }, 700);
  }, []);

  const positionDateWithinCurrentRange = useCallback((
    date: string,
    behavior: ScrollBehavior,
  ) => {
    const container = scrollRef.current;
    if (!container) return;
    const targetScrollLeft = clamp(
      header.coordinates.dateToX(date) - container.clientWidth / 2,
      0,
      Math.max(container.scrollWidth - container.clientWidth, 0),
    );
    isNavigatingToTodayRef.current = true;
    desiredScrollLeftRef.current = targetScrollLeft;
    container.scrollTo({ left: targetScrollLeft, behavior });
    updateScrollbar();
    scheduleTodayNavigationRelease(behavior);
  }, [header.coordinates, scheduleTodayNavigationRelease, updateScrollbar]);

  const scrollToToday = useCallback(() => {
    const expandedRange = extendTimelineRangeToIncludeDate(
      timelineRange,
      today,
      {
        pastMonths: TIMELINE_RANGE_EXTENSION_MONTHS,
        futureMonths: TIMELINE_RANGE_EXTENSION_MONTHS,
      },
    );
    if (
      expandedRange.startDate !== timelineRange.startDate
      || expandedRange.endDate !== timelineRange.endDate
    ) {
      pendingTodayScrollBehaviorRef.current = 'smooth';
      setTimelineRange(expandedRange);
      return;
    }
    positionDateWithinCurrentRange(today, 'smooth');
  }, [positionDateWithinCurrentRange, timelineRange, today]);

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
    checkAndExtendTimeline(container.scrollLeft, nextScrollLeft);
  }, [checkAndExtendTimeline, scrollbar.thumbWidth, updateScrollbar]);

  const rebaseScrollbarDrag = useCallback((container: HTMLDivElement) => {
    const drag = scrollbarDragRef.current;
    if (!drag.active) return;
    drag.startX = drag.latestX;
    drag.startScrollLeft = container.scrollLeft;
    drag.startScrollRange = Math.max(container.scrollWidth - container.clientWidth, 0);
  }, []);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const pending = pendingLeftExtensionRef.current;
    if (!container || !pending) return;

    const compensatedScrollLeft = compensatePrependScrollLeft(
      pending.previousScrollLeft,
      pending.prependWidth,
    );
    const compensatedDesiredScrollLeft = compensatePrependScrollLeft(
      pending.previousDesiredScrollLeft,
      pending.prependWidth,
    );
    desiredScrollLeftRef.current = compensatedDesiredScrollLeft;
    if (timelinePanRef.current.isPointerDown) {
      timelinePanRef.current.startScrollLeft = compensatePrependScrollLeft(
        timelinePanRef.current.startScrollLeft,
        pending.prependWidth,
      );
    }
    container.scrollLeft = clamp(
      compensatedScrollLeft,
      0,
      Math.max(container.scrollWidth - container.clientWidth, 0),
    );
    rebaseScrollbarDrag(container);
    updateScrollbar();

    if (leftExtensionReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(leftExtensionReleaseFrameRef.current);
    }
    leftExtensionReleaseFrameRef.current = window.requestAnimationFrame(() => {
      pendingLeftExtensionRef.current = null;
      isExtendingLeftRef.current = false;
      leftExtensionReleaseFrameRef.current = null;
      if (timelinePanRef.current.isPointerDown || scrollbarDragRef.current.active) {
        checkAndExtendTimeline(container.scrollLeft, desiredScrollLeftRef.current);
      }
    });
  }, [
    checkAndExtendTimeline,
    header.coordinates.canvasWidth,
    rebaseScrollbarDrag,
    timelineRange.startDate,
    updateScrollbar,
  ]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const pending = pendingRightExtensionRef.current;
    if (!container || !pending) return;

    const interactionActive = timelinePanRef.current.isPointerDown || scrollbarDragRef.current.active;
    const desiredScrollLeft = interactionActive
      ? pending.previousDesiredScrollLeft
      : pending.previousScrollLeft;
    desiredScrollLeftRef.current = desiredScrollLeft;
    container.scrollLeft = clamp(
      pending.previousScrollLeft,
      0,
      Math.max(container.scrollWidth - container.clientWidth, 0),
    );
    rebaseScrollbarDrag(container);
    updateScrollbar();

    if (rightExtensionReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(rightExtensionReleaseFrameRef.current);
    }
    rightExtensionReleaseFrameRef.current = window.requestAnimationFrame(() => {
      pendingRightExtensionRef.current = null;
      isExtendingRightRef.current = false;
      rightExtensionReleaseFrameRef.current = null;
      if (timelinePanRef.current.isPointerDown || scrollbarDragRef.current.active) {
        checkAndExtendTimeline(container.scrollLeft, desiredScrollLeftRef.current);
      }
    });
  }, [
    checkAndExtendTimeline,
    header.coordinates.canvasWidth,
    rebaseScrollbarDrag,
    timelineRange.endDate,
    updateScrollbar,
  ]);

  useLayoutEffect(() => {
    const behavior = pendingTodayScrollBehaviorRef.current;
    if (
      behavior === null
      || today < timelineRange.startDate
      || today > timelineRange.endDate
    ) return;
    positionDateWithinCurrentRange(today, behavior);
    pendingTodayScrollBehaviorRef.current = null;
  }, [positionDateWithinCurrentRange, timelineRange, today]);

  useLayoutEffect(() => {
    if (didInitializeFocusRef.current) return;
    positionDateWithinCurrentRange(initialFocusDate ?? today, 'auto');
    didInitializeFocusRef.current = true;
  }, [initialFocusDate, positionDateWithinCurrentRange, today]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (projectRowsRef.current) {
      projectRowsRef.current.style.transform = `translateY(${-container.scrollTop}px)`;
    }
    const interactionActive = timelinePanRef.current.isPointerDown || scrollbarDragRef.current.active;
    const desiredScrollLeft = interactionActive
      ? desiredScrollLeftRef.current
      : container.scrollLeft;
    if (!interactionActive) desiredScrollLeftRef.current = container.scrollLeft;
    updateScrollbar();
    checkAndExtendTimeline(container.scrollLeft, desiredScrollLeft);
  }, [checkAndExtendTimeline, updateScrollbar]);

  useEffect(() => {
    updateScrollbar();
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    if (!container || !track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateScrollbar);
    observer.observe(container);
    observer.observe(track);
    return () => observer.disconnect();
  }, [displayRows, header.coordinates.canvasWidth, updateScrollbar]);

  const finishTimelinePan = useCallback((commitPendingPosition = true) => {
    const container = scrollRef.current;
    const pan = timelinePanRef.current;
    const pointerId = pan.activePointerId;

    if (pan.animationFrameId !== null) {
      window.cancelAnimationFrame(pan.animationFrameId);
      pan.animationFrameId = null;
      if (commitPendingPosition && pan.isDragging && container) {
        const desiredScrollLeft = timelinePanScrollLeft(
          pan.startScrollLeft,
          pan.startClientX,
          pan.latestClientX,
        );
        desiredScrollLeftRef.current = desiredScrollLeft;
        container.scrollLeft = clamp(
          desiredScrollLeft,
          0,
          Math.max(container.scrollWidth - container.clientWidth, 0),
        );
        updateScrollbar();
        checkAndExtendTimeline(container.scrollLeft, desiredScrollLeft);
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
  }, [checkAndExtendTimeline, updateScrollbar]);

  const requestTimelineZoom = useCallback((nextZoomLevelIndex: number, anchorClientX: number) => {
    const container = scrollRef.current;
    const normalizedZoomLevelIndex = clamp(
      nextZoomLevelIndex,
      0,
      TIMELINE_ZOOM_DENSITIES.length - 1,
    );
    if (
      !container
      || normalizedZoomLevelIndex === zoomLevelIndex
      || timelinePanRef.current.isPointerDown
      || scrollbarDragRef.current.active
      || pendingZoomAnchorRef.current
      || isExtendingLeftRef.current
      || isExtendingRightRef.current
      || isNavigatingToTodayRef.current
    ) {
      return false;
    }

    const normalizedAnchorClientX = clamp(anchorClientX, 0, container.clientWidth);
    pendingZoomAnchorRef.current = {
      anchorDate: header.coordinates.xToDate(container.scrollLeft + normalizedAnchorClientX),
      anchorClientX: normalizedAnchorClientX,
    };
    isZoomingRef.current = true;
    setZoomLevelIndex(normalizedZoomLevelIndex);
    return true;
  }, [header.coordinates, zoomLevelIndex]);

  const zoomTimelineBy = useCallback((levelDelta: number) => {
    const container = scrollRef.current;
    if (!container) return false;
    return requestTimelineZoom(zoomLevelIndex + levelDelta, container.clientWidth / 2);
  }, [requestTimelineZoom, zoomLevelIndex]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const pendingZoomAnchor = pendingZoomAnchorRef.current;
    if (!container || !pendingZoomAnchor) return;

    const nextScrollLeft = clamp(
      header.coordinates.dateToX(pendingZoomAnchor.anchorDate) - pendingZoomAnchor.anchorClientX,
      0,
      Math.max(container.scrollWidth - container.clientWidth, 0),
    );
    desiredScrollLeftRef.current = nextScrollLeft;
    container.scrollLeft = nextScrollLeft;
    pendingZoomAnchorRef.current = null;
    updateScrollbar();
    if (zoomReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomReleaseFrameRef.current);
    }
    zoomReleaseFrameRef.current = window.requestAnimationFrame(() => {
      isZoomingRef.current = false;
      zoomReleaseFrameRef.current = null;
    });
  }, [header.coordinates, updateScrollbar]);

  const handleTimelineWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      if (wheelZoomLockedRef.current || timelinePanRef.current.isPointerDown) return;

      const container = event.currentTarget;
      const viewportRect = container.getBoundingClientRect();
      const didZoom = requestTimelineZoom(
        zoomLevelIndex + (event.deltaY < 0 ? 1 : -1),
        event.clientX - viewportRect.left,
      );
      if (!didZoom) return;

      wheelZoomLockedRef.current = true;
      wheelZoomReleaseTimerRef.current = window.setTimeout(() => {
        wheelZoomLockedRef.current = false;
        wheelZoomReleaseTimerRef.current = null;
      }, TIMELINE_WHEEL_ZOOM_THROTTLE_MS);
  }, [requestTimelineZoom, zoomLevelIndex]);

  useEffect(() => {
    return () => {
      if (wheelZoomReleaseTimerRef.current !== null) {
        window.clearTimeout(wheelZoomReleaseTimerRef.current);
        wheelZoomReleaseTimerRef.current = null;
      }
      wheelZoomLockedRef.current = false;
      if (leftExtensionReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(leftExtensionReleaseFrameRef.current);
      }
      if (rightExtensionReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(rightExtensionReleaseFrameRef.current);
      }
      if (zoomReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(zoomReleaseFrameRef.current);
      }
      if (todayNavigationReleaseTimerRef.current !== null) {
        window.clearTimeout(todayNavigationReleaseTimerRef.current);
      }
      pendingLeftExtensionRef.current = null;
      pendingRightExtensionRef.current = null;
      pendingTodayScrollBehaviorRef.current = null;
      isExtendingLeftRef.current = false;
      isExtendingRightRef.current = false;
      isNavigatingToTodayRef.current = false;
      isZoomingRef.current = false;
    };
  }, []);

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
      checkAndExtendTimeline(container.scrollLeft, desiredScrollLeftRef.current);
    });
  }, [checkAndExtendTimeline, updateScrollbar]);

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
      data-timeline-scale={timeScale}
      data-timeline-zoom-level={zoomLevelIndex}
      data-timeline-px-per-day={pxPerDay}
      data-timeline-start-date={timelineRange.startDate}
      data-timeline-end-date={timelineRange.endDate}
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
              <button
                type="button"
                className="icon-button icon-button--plain timeline-zoom-button"
                disabled={zoomLevelIndex === 0}
                onClick={() => zoomTimelineBy(-1)}
                aria-label={t.projectManagement.zoomOut}
              >
                <ZoomOut size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button icon-button--plain timeline-zoom-button"
                disabled={zoomLevelIndex === TIMELINE_ZOOM_DENSITIES.length - 1}
                onClick={() => zoomTimelineBy(1)}
                aria-label={t.projectManagement.zoomIn}
              >
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
            >
              {t.projectManagement.today}
            </button>
            <div className="scale-menu-wrap">
              <button
                type="button"
                className={`scale-button${scaleMenuOpen ? ' is-open' : ''}`}
                onClick={() => setScaleMenuOpen((open) => !open)}
                aria-label={t.projectManagement.timelineScale}
                aria-haspopup="menu"
                aria-expanded={scaleMenuOpen}
              >
                {{
                  year: t.projectManagement.scaleYear,
                  quarter: t.projectManagement.scaleQuarter,
                  month: t.projectManagement.scaleMonth,
                  week: t.projectManagement.scaleWeek,
                  day: t.projectManagement.scaleDay,
                }[timeScale]}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {scaleMenuOpen ? (
                <>
                  <button
                    type="button"
                    className="menu-backdrop"
                    aria-label={t.projectManagement.closeScaleMenu}
                    onClick={() => setScaleMenuOpen(false)}
                  />
                  <div className="dropdown-menu scale-menu" role="menu">
                    {TIMELINE_TIME_SCALES.map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        role="menuitemradio"
                        aria-checked={timeScale === scale}
                        className={timeScale === scale ? 'is-selected' : ''}
                        onClick={() => {
                          setTimeScale(scale);
                          setScaleMenuOpen(false);
                        }}
                      >
                        {{
                          year: t.projectManagement.scaleYear,
                          quarter: t.projectManagement.scaleQuarter,
                          month: t.projectManagement.scaleMonth,
                          week: t.projectManagement.scaleWeek,
                          day: t.projectManagement.scaleDay,
                        }[scale]}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
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
            onWheel={handleTimelineWheel}
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
              segments={header.segments}
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
                      <TimelineMilestones
                        milestones={row.timeline.milestones}
                        coordinates={header.coordinates}
                      />
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
                  latestX: event.clientX,
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
                drag.latestX = event.clientX;
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
                checkAndExtendTimeline(container.scrollLeft, nextScrollLeft);
              }}
              onPointerUp={(event) => {
                const container = scrollRef.current;
                scrollbarDragRef.current.active = false;
                desiredScrollLeftRef.current = container?.scrollLeft ?? 0;
                if (container) {
                  checkAndExtendTimeline(container.scrollLeft, desiredScrollLeftRef.current);
                }
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
