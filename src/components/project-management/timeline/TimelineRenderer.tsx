import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  ChevronDown,
  PanelRight,
  Plus,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { format, useI18n } from '@/i18n';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type {
  AddProjectMemberCommand,
  ChangeProjectMemberRolesCommand,
  CreateMilestoneCommand,
  CreateProjectCommand,
  CreateProjectTimelineCommand,
  DeleteMilestoneCommand,
  DeleteProjectCommand,
  DeleteProjectTimelineCommand,
  MoveMilestoneCommand,
  MoveProjectTimelineCommand,
  ResizeProjectTimelineCommand,
  RemoveProjectMemberCommand,
  SetProjectManagerCommand,
  UpdateMilestoneCommand,
  UpdateProjectCommand,
  UpdateProjectTimelineCommand,
} from '@/project-management/application';
import type { ProjectGraph } from '@/project-management/domain';
import {
  addTimelineDays,
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
import { MilestoneQuickCard } from './MilestoneQuickCard';
import {
  createMilestoneQuickCardController,
  type MilestoneQuickCardTarget,
} from './milestoneQuickCardController';
import type { MilestoneQuickCardMetrics } from './milestoneQuickCardData';
import {
  createMilestoneDragSession,
  createProjectBarMoveSession,
  createProjectBarResizeSession,
  EMPTY_TIMELINE_EDGE_EXTENSION_GATE,
  evaluateTimelineEdgeExtension,
  updateProjectBarMovePreview,
  updateProjectBarResizePreview,
  updateMilestoneDragPreview,
  type MilestoneDragSession,
  type ProjectBarMoveSession,
  type ProjectBarResizeSession,
  type TimelineEdgeDirection,
  type TimelineEdgeExtensionGate,
} from './timelineDragSession';
import {
  calculateTimelineScrollbarGeometry,
  type TimelineScrollbarGeometry,
} from './timelineScrollbar';
import { ProjectListRow } from '../ProjectList';
import {
  CreateMilestoneDialog,
  CreateProjectDialog,
  CreateTimelineDialog,
} from '../ProjectManagementCrudDialogs';
import { ProjectManagementDrawer } from '../drawer/ProjectManagementDrawer';
import type { ProjectManagementDrawerTarget } from '../drawer/projectManagementDrawerData';
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

const EMPTY_SCROLLBAR: TimelineScrollbarGeometry = Object.freeze({
  maxScrollLeft: 0,
  progress: 0,
  thumbWidth: 0,
  thumbTravel: 0,
  thumbLeft: 0,
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

type TimelineRangeExtensionInteraction =
  | 'native-scroll'
  | 'track-click'
  | 'scrollbar-drag'
  | 'timeline-pan'
  | 'milestone-drag'
  | 'project-move'
  | 'project-resize';

interface PendingLeftExtension {
  previousScrollLeft: number;
  previousDesiredScrollLeft: number;
  prependWidth: number;
  interaction: TimelineRangeExtensionInteraction;
}

interface PendingRightExtension {
  previousScrollLeft: number;
  previousDesiredScrollLeft: number;
  interaction: TimelineRangeExtensionInteraction;
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

export function TimelineRenderer({
  graph,
  today = localTodayDateKey(),
  initialFocusDate,
  workspaceTitle,
  highlightedMonth: highlightedMonthKey,
  toolbarLeading,
  quickCardMetricsByMilestoneId,
  onMoveMilestone,
  onMoveProjectTimeline,
  onResizeProjectTimeline,
  onUpdateProject,
  onUpdateProjectTimeline,
  onUpdateMilestone,
  onCreateProject,
  onCreateProjectTimeline,
  onCreateMilestone,
  onDeleteProject,
  onDeleteProjectTimeline,
  onDeleteMilestone,
  onAddMember,
  onRemoveMember,
  onChangeMemberRoles,
  onSetProjectManager,
}: {
  graph: Readonly<ProjectGraph>;
  today?: string;
  initialFocusDate?: string;
  workspaceTitle?: string;
  highlightedMonth?: string;
  toolbarLeading?: ReactNode;
  quickCardMetricsByMilestoneId?: ReadonlyMap<string, Readonly<MilestoneQuickCardMetrics>>;
  onMoveMilestone?: (command: MoveMilestoneCommand) => Promise<void>;
  onMoveProjectTimeline?: (command: MoveProjectTimelineCommand) => Promise<void>;
  onResizeProjectTimeline?: (command: ResizeProjectTimelineCommand) => Promise<void>;
  onUpdateProject?: (command: UpdateProjectCommand) => Promise<void>;
  onUpdateProjectTimeline?: (command: UpdateProjectTimelineCommand) => Promise<void>;
  onUpdateMilestone?: (command: UpdateMilestoneCommand) => Promise<void>;
  onCreateProject?: (command: CreateProjectCommand) => Promise<void>;
  onCreateProjectTimeline?: (command: CreateProjectTimelineCommand) => Promise<void>;
  onCreateMilestone?: (command: CreateMilestoneCommand) => Promise<void>;
  onDeleteProject?: (command: DeleteProjectCommand) => Promise<void>;
  onDeleteProjectTimeline?: (command: DeleteProjectTimelineCommand) => Promise<void>;
  onDeleteMilestone?: (command: DeleteMilestoneCommand) => Promise<void>;
  onAddMember?: (command: AddProjectMemberCommand) => Promise<void>;
  onRemoveMember?: (command: RemoveProjectMemberCommand) => Promise<void>;
  onChangeMemberRoles?: (command: ChangeProjectMemberRolesCommand) => Promise<void>;
  onSetProjectManager?: (command: SetProjectManagerCommand) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const projectRowsRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
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
  const timelineEndDateRef = useRef('');
  const timelinePxPerDayRef = useRef(0);
  const leftExtensionReleaseFrameRef = useRef<number | null>(null);
  const rightExtensionReleaseFrameRef = useRef<number | null>(null);
  const zoomReleaseFrameRef = useRef<number | null>(null);
  const todayNavigationReleaseTimerRef = useRef<number | null>(null);
  const wheelZoomLockedRef = useRef(false);
  const wheelZoomReleaseTimerRef = useRef<number | null>(null);
  const desiredScrollLeftRef = useRef(0);
  const scrollbarGeometryRef = useRef<TimelineScrollbarGeometry>(EMPTY_SCROLLBAR);
  const dragEdgeExtensionGateRef = useRef<TimelineEdgeExtensionGate>(
    EMPTY_TIMELINE_EDGE_EXTENSION_GATE,
  );
  const milestoneDragRef = useRef<MilestoneDragSession | null>(null);
  const milestoneDragElementRef = useRef<HTMLSpanElement | null>(null);
  const savingMilestoneIdsRef = useRef(new Set<string>());
  const projectBarDragRef = useRef<ProjectBarMoveSession | ProjectBarResizeSession | null>(null);
  const projectBarDragElementRef = useRef<HTMLSpanElement | null>(null);
  const savingTimelineIdsRef = useRef(new Set<string>());
  const suppressedClickRef = useRef<{ kind: 'timeline' | 'milestone'; id: string; until: number } | null>(null);
  const [zoomLevelIndex, setZoomLevelIndex] = useState(DEFAULT_TIMELINE_ZOOM_LEVEL_INDEX);
  const [timeScale, setTimeScale] = useState<TimelineTimeScale>(DEFAULT_TIMELINE_TIME_SCALE);
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [hoveredTimelineId, setHoveredTimelineId] = useState<string | null>(null);
  const [quickCardTarget, setQuickCardTarget] = useState<MilestoneQuickCardTarget | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<ProjectManagementDrawerTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<
    | { kind: 'project' }
    | { kind: 'timeline'; projectId: string }
    | { kind: 'milestone'; projectId: string; timelineId: string }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectManagementDrawerTarget | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deletingRef = useRef(false);
  const [milestoneDragSession, setMilestoneDragSession] = useState<MilestoneDragSession | null>(null);
  const [savingMilestoneIds, setSavingMilestoneIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [projectBarDragSession, setProjectBarDragSession] = useState<
    ProjectBarMoveSession | ProjectBarResizeSession | null
  >(null);
  const [savingTimelineIds, setSavingTimelineIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [quickCardController] = useState(
    () => createMilestoneQuickCardController(setQuickCardTarget),
  );
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
  const highlightedMonth = header.months.find(
    (month) => month.key === (highlightedMonthKey ?? today.slice(0, 7)),
  ) ?? null;
  const rowsHeight = displayRows.length * PROJECT_OVERVIEW_ROW_HEIGHT;
  const todayLabel = useMemo(() => {
    const [, month, day] = today.split('-').map(Number);
    if (!month || !day) return today;
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
      .format(new Date(2000, month - 1, day));
  }, [locale, today]);

  const publishScrollbarGeometry = useCallback((allowRangeRebase = false) => {
    if (
      !allowRangeRebase
      && (pendingLeftExtensionRef.current || pendingRightExtensionRef.current)
    ) return;
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!container || !track || !thumb) return;
    const geometry = calculateTimelineScrollbarGeometry({
      scrollLeft: container.scrollLeft,
      scrollWidth: container.scrollWidth,
      clientWidth: container.clientWidth,
      trackWidth: track.clientWidth,
    });
    scrollbarGeometryRef.current = geometry;
    thumb.setAttribute(
      'style',
      `width: ${geometry.thumbWidth}px; left: ${geometry.thumbLeft}px;`,
    );
    thumb.setAttribute('aria-valuenow', String(Math.round(geometry.progress * 100)));
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
    timelineEndDateRef.current = timelineRange.endDate;
    timelinePxPerDayRef.current = pxPerDay;
  }, [pxPerDay, timelineRange.endDate, timelineRange.startDate]);

  const checkAndExtendTimeline = useCallback((
    currentScrollLeft: number,
    desiredScrollLeft = currentScrollLeft,
    interaction: TimelineRangeExtensionInteraction = 'native-scroll',
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
        interaction,
      };
      setTimelineRange((current) => ({ ...current, startDate: nextStartDate }));
    }

    if (edges.right && !isExtendingRightRef.current) {
      const previousEndDate = timelineEndDateRef.current;
      const nextEndDate = addTimelineMonths(previousEndDate, TIMELINE_RANGE_EXTENSION_MONTHS);
      isExtendingRightRef.current = true;
      pendingRightExtensionRef.current = {
        previousScrollLeft: currentScrollLeft,
        previousDesiredScrollLeft: desiredScrollLeft,
        interaction,
      };
      setTimelineRange((current) => ({ ...current, endDate: nextEndDate }));
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
    publishScrollbarGeometry();
    scheduleTodayNavigationRelease(behavior);
  }, [header.coordinates, publishScrollbarGeometry, scheduleTodayNavigationRelease]);

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
    const thumbWidth = scrollbarGeometryRef.current.thumbWidth;
    const travel = Math.max(rect.width - thumbWidth, 0);
    const progress = travel > 0
      ? clamp((clientX - rect.left - thumbWidth / 2) / travel, 0, 1)
      : 0;
    const nextScrollLeft = progress * Math.max(container.scrollWidth - container.clientWidth, 0);
    desiredScrollLeftRef.current = nextScrollLeft;
    container.scrollLeft = nextScrollLeft;
    publishScrollbarGeometry();
    checkAndExtendTimeline(container.scrollLeft, nextScrollLeft, 'track-click');
  }, [checkAndExtendTimeline, publishScrollbarGeometry]);

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
    publishScrollbarGeometry(true);

    if (leftExtensionReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(leftExtensionReleaseFrameRef.current);
    }
    leftExtensionReleaseFrameRef.current = window.requestAnimationFrame(() => {
      pendingLeftExtensionRef.current = null;
      isExtendingLeftRef.current = false;
      leftExtensionReleaseFrameRef.current = null;
    });
  }, [
    header.coordinates.canvasWidth,
    rebaseScrollbarDrag,
    timelineRange.startDate,
    publishScrollbarGeometry,
  ]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const pending = pendingRightExtensionRef.current;
    if (!container || !pending) return;

    const desiredScrollLeft = pending.interaction === 'scrollbar-drag'
      ? pending.previousDesiredScrollLeft
      : pending.previousScrollLeft;
    desiredScrollLeftRef.current = desiredScrollLeft;
    container.scrollLeft = clamp(
      desiredScrollLeft,
      0,
      Math.max(container.scrollWidth - container.clientWidth, 0),
    );
    if (pending.interaction === 'scrollbar-drag') rebaseScrollbarDrag(container);
    publishScrollbarGeometry(true);

    if (rightExtensionReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(rightExtensionReleaseFrameRef.current);
    }
    rightExtensionReleaseFrameRef.current = window.requestAnimationFrame(() => {
      pendingRightExtensionRef.current = null;
      isExtendingRightRef.current = false;
      rightExtensionReleaseFrameRef.current = null;
    });
  }, [
    header.coordinates.canvasWidth,
    rebaseScrollbarDrag,
    timelineRange.endDate,
    publishScrollbarGeometry,
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
    quickCardController.dismiss('scroll');
    if (projectRowsRef.current) {
      projectRowsRef.current.style.transform = `translateY(${-container.scrollTop}px)`;
    }
    const interactionActive = timelinePanRef.current.isPointerDown || scrollbarDragRef.current.active;
    const desiredScrollLeft = interactionActive
      ? desiredScrollLeftRef.current
      : container.scrollLeft;
    if (!interactionActive) desiredScrollLeftRef.current = container.scrollLeft;
    if (
      pendingLeftExtensionRef.current
      || pendingRightExtensionRef.current
      || isExtendingLeftRef.current
      || isExtendingRightRef.current
    ) return;
    publishScrollbarGeometry();
    if (
      interactionActive
      || milestoneDragRef.current
      || projectBarDragRef.current
    ) return;
    checkAndExtendTimeline(container.scrollLeft, desiredScrollLeft);
  }, [checkAndExtendTimeline, publishScrollbarGeometry, quickCardController]);

  useLayoutEffect(() => {
    publishScrollbarGeometry();
    const container = scrollRef.current;
    const track = scrollbarRef.current;
    if (!container || !track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => publishScrollbarGeometry());
    observer.observe(container);
    observer.observe(track);
    return () => observer.disconnect();
  }, [displayRows, header.coordinates.canvasWidth, publishScrollbarGeometry]);

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
        publishScrollbarGeometry();
        checkAndExtendTimeline(container.scrollLeft, desiredScrollLeft, 'timeline-pan');
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
  }, [checkAndExtendTimeline, publishScrollbarGeometry]);

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
      || milestoneDragRef.current
      || projectBarDragRef.current
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
    quickCardController.closeQuickCardOnInteractionStart('timeline-zoom');
    isZoomingRef.current = true;
    setZoomLevelIndex(normalizedZoomLevelIndex);
    return true;
  }, [header.coordinates, quickCardController, zoomLevelIndex]);

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
    publishScrollbarGeometry();
    if (zoomReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomReleaseFrameRef.current);
    }
    zoomReleaseFrameRef.current = window.requestAnimationFrame(() => {
      isZoomingRef.current = false;
      zoomReleaseFrameRef.current = null;
    });
  }, [header.coordinates, publishScrollbarGeometry]);

  const handleTimelineWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
      if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
      event.preventDefault();
      if (
        wheelZoomLockedRef.current
        || timelinePanRef.current.isPointerDown
        || milestoneDragRef.current
        || projectBarDragRef.current
      ) return;

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
      quickCardController.dispose();
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
  }, [quickCardController]);

  useEffect(() => {
    quickCardController.dismiss('data-change');
  }, [graph, quickCardController]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!quickCardController.isOpen()) return;
      const target = event.target;
      if (
        target instanceof Element
        && target.closest('[data-milestone-popover-root], [data-milestone-id]')
      ) return;
      quickCardController.dismiss('outside-click');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') quickCardController.dismiss('escape');
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [quickCardController]);

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
    if (
      !container
      || pan.isPointerDown
      || scrollbarDragRef.current.active
      || milestoneDragRef.current
      || projectBarDragRef.current
    ) return;

    quickCardController.closeQuickCardOnInteractionStart('timeline-pan');

    pan.activePointerId = event.pointerId;
    pan.isPointerDown = true;
    pan.isDragging = false;
    pan.startClientX = event.clientX;
    pan.latestClientX = event.clientX;
    pan.startScrollLeft = container.scrollLeft;
    desiredScrollLeftRef.current = container.scrollLeft;
  }, [quickCardController]);

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
      publishScrollbarGeometry();
      checkAndExtendTimeline(
        container.scrollLeft,
        desiredScrollLeftRef.current,
        'timeline-pan',
      );
    });
  }, [checkAndExtendTimeline, publishScrollbarGeometry]);

  const handleTimelinePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (timelinePanRef.current.activePointerId === event.pointerId) finishTimelinePan();
  }, [finishTimelinePan]);

  const handleTimelinePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (timelinePanRef.current.activePointerId === event.pointerId) finishTimelinePan(false);
  }, [finishTimelinePan]);

  const handleMilestonePreviewEnter = useCallback((
    anchorElement: HTMLElement,
    milestones: MilestoneQuickCardTarget['milestones'],
  ) => {
    const milestoneId = milestones[0]?.id;
    if (!milestoneId) return;
    quickCardController.enter({ anchorElement, milestoneId, milestones });
  }, [quickCardController]);

  const handleQuickCardMilestoneSelect = useCallback((milestoneId: string) => {
    if (!quickCardTarget) return;
    const milestone = quickCardTarget.milestones.find((item) => item.id === milestoneId);
    if (!milestone) return;
    quickCardController.dismiss('outside-click');
    setDrawerTarget({ kind: 'milestone', milestoneId });
  }, [quickCardController, quickCardTarget]);

  const openMilestoneDrawer = useCallback((milestoneId: string) => {
    const suppression = suppressedClickRef.current;
    if (suppression?.kind === 'milestone' && suppression.id === milestoneId) {
      suppressedClickRef.current = null;
      if (Date.now() <= suppression.until) return;
    }
    quickCardController.dismiss('outside-click');
    setDrawerTarget({ kind: 'milestone', milestoneId });
  }, [quickCardController]);

  const openTimelineDrawer = useCallback((timelineId: string) => {
    const suppression = suppressedClickRef.current;
    if (suppression?.kind === 'timeline' && suppression.id === timelineId) {
      suppressedClickRef.current = null;
      if (Date.now() <= suppression.until) return;
    }
    quickCardController.dismiss('outside-click');
    setDrawerTarget({ kind: 'timeline', timelineId });
  }, [quickCardController]);

  const extendTimelineForDragPointer = useCallback((clientX: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edgeThreshold = container.clientWidth * TIMELINE_RANGE_EDGE_THRESHOLD_RATIO;
    let direction: TimelineEdgeDirection | null = null;
    if (clientX - rect.left < edgeThreshold) direction = 'left';
    else if (rect.right - clientX < edgeThreshold) direction = 'right';
    const boundary = direction === 'left'
      ? timelineStartDateRef.current
      : direction === 'right'
        ? timelineRange.endDate
        : null;
    const result = evaluateTimelineEdgeExtension(
      dragEdgeExtensionGateRef.current,
      clientX,
      direction,
      boundary,
    );
    dragEdgeExtensionGateRef.current = result.gate;
    if (!result.shouldExtend) return;
    const interaction: TimelineRangeExtensionInteraction = milestoneDragRef.current
      ? 'milestone-drag'
      : projectBarDragRef.current?.type === 'project-bar-move'
        ? 'project-move'
        : 'project-resize';
    if (direction === 'left') {
      checkAndExtendTimeline(container.scrollLeft, -edgeThreshold, interaction);
    } else if (direction === 'right') {
      checkAndExtendTimeline(
        container.scrollLeft,
        container.scrollWidth + edgeThreshold,
        interaction,
      );
    }
  }, [checkAndExtendTimeline, timelineRange.endDate]);

  const releaseMilestonePointer = useCallback((pointerId: number) => {
    const element = milestoneDragElementRef.current;
    milestoneDragElementRef.current = null;
    if (!element?.hasPointerCapture?.(pointerId)) return;
    try {
      element.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }, []);

  const cancelMilestoneDrag = useCallback((pointerId?: number) => {
    const session = milestoneDragRef.current;
    if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) return;
    milestoneDragRef.current = null;
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    setMilestoneDragSession(null);
    releaseMilestonePointer(session.pointerId);
  }, [releaseMilestonePointer]);

  const completeMilestoneDrag = useCallback(async (pointerId: number) => {
    const session = milestoneDragRef.current;
    if (!session || session.pointerId !== pointerId) return;

    milestoneDragRef.current = null;
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    releaseMilestonePointer(pointerId);
    const changed = session.previewDate !== session.originalDate;
    if (!session.hasExceededDragThreshold || !changed || !onMoveMilestone) {
      setMilestoneDragSession(null);
      return;
    }

    if (savingMilestoneIdsRef.current.has(session.sourceEntityId)) {
      setMilestoneDragSession(null);
      return;
    }
    savingMilestoneIdsRef.current.add(session.sourceEntityId);
    setSavingMilestoneIds(new Set(savingMilestoneIdsRef.current));

    try {
      await onMoveMilestone({
        milestoneId: session.sourceEntityId,
        projectId: session.projectId,
        timelineId: session.timelineId,
        expectedDate: session.originalDate,
        date: session.previewDate,
      });
    } catch {
      // The save-first runtime keeps the graph unchanged; clearing preview is the rollback.
    } finally {
      savingMilestoneIdsRef.current.delete(session.sourceEntityId);
      setSavingMilestoneIds(new Set(savingMilestoneIdsRef.current));
      setMilestoneDragSession(null);
    }
  }, [onMoveMilestone, releaseMilestonePointer]);

  const handleMilestoneDragPointerDown = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
    milestone: Parameters<typeof createMilestoneDragSession>[0],
  ) => {
    if (
      event.button !== 0
      || !event.isPrimary
      || !onMoveMilestone
      || milestoneDragRef.current
      || projectBarDragRef.current
      || timelinePanRef.current.isPointerDown
      || scrollbarDragRef.current.active
      || savingMilestoneIdsRef.current.has(milestone.id)
    ) return;

    event.stopPropagation();
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    const session = createMilestoneDragSession(milestone, event.pointerId, event.clientX);
    milestoneDragRef.current = session;
    milestoneDragElementRef.current = event.currentTarget;
    setMilestoneDragSession(session);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      cancelMilestoneDrag(event.pointerId);
    }
  }, [cancelMilestoneDrag, onMoveMilestone]);

  const handleMilestoneDragPointerMove = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const current = milestoneDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const next = updateMilestoneDragPreview(current, event.clientX, header.coordinates);
    if (!current.hasExceededDragThreshold && next.hasExceededDragThreshold) {
      quickCardController.closeQuickCardOnInteractionStart('milestone-drag');
      window.getSelection()?.removeAllRanges();
    }
    milestoneDragRef.current = next;
    setMilestoneDragSession(next);
    if (!next.hasExceededDragThreshold) return;

    event.preventDefault();
    extendTimelineForDragPointer(event.clientX);
  }, [extendTimelineForDragPointer, header.coordinates, quickCardController]);

  const handleMilestoneDragPointerUp = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (milestoneDragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (milestoneDragRef.current.hasExceededDragThreshold) {
      suppressedClickRef.current = {
        kind: 'milestone', id: milestoneDragRef.current.sourceEntityId, until: Date.now() + 500,
      };
      event.preventDefault();
    }
    void completeMilestoneDrag(event.pointerId);
  }, [completeMilestoneDrag]);

  const handleMilestoneDragPointerCancel = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (milestoneDragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    cancelMilestoneDrag(event.pointerId);
  }, [cancelMilestoneDrag]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (milestoneDragRef.current?.pointerId === event.pointerId) {
        void completeMilestoneDrag(event.pointerId);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => cancelMilestoneDrag(event.pointerId);
    const handleBlur = () => cancelMilestoneDrag();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !milestoneDragRef.current) return;
      event.preventDefault();
      cancelMilestoneDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      cancelMilestoneDrag();
    };
  }, [cancelMilestoneDrag, completeMilestoneDrag]);

  const releaseProjectBarPointer = useCallback((pointerId: number) => {
    const element = projectBarDragElementRef.current;
    projectBarDragElementRef.current = null;
    if (!element?.hasPointerCapture?.(pointerId)) return;
    try {
      element.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }, []);

  const cancelProjectBarDrag = useCallback((pointerId?: number) => {
    const session = projectBarDragRef.current;
    if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) return;
    projectBarDragRef.current = null;
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    setProjectBarDragSession(null);
    releaseProjectBarPointer(session.pointerId);
  }, [releaseProjectBarPointer]);

  const completeProjectBarDrag = useCallback(async (pointerId: number) => {
    const session = projectBarDragRef.current;
    if (!session || session.pointerId !== pointerId) return;
    projectBarDragRef.current = null;
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    releaseProjectBarPointer(pointerId);

    const isMove = session.type === 'project-bar-move';
    const side = session.type === 'project-bar-resize-start' ? 'start' : 'end';
    const changed = isMove
      ? session.deltaDays !== 0
      : (side === 'start'
          ? session.previewStartDate !== session.originalStartDate
          : session.previewEndDate !== session.originalEndDate);
    const canCommit = isMove ? Boolean(onMoveProjectTimeline) : Boolean(onResizeProjectTimeline);
    if (!session.hasExceededDragThreshold || !changed || !canCommit) {
      setProjectBarDragSession(null);
      return;
    }

    const affectedMilestoneIds = isMove
      ? session.originalMilestones.map((milestone) => milestone.id)
      : [];
    if (
      savingTimelineIdsRef.current.has(session.sourceEntityId)
      || affectedMilestoneIds.some((id) => savingMilestoneIdsRef.current.has(id))
    ) {
      setProjectBarDragSession(null);
      return;
    }
    savingTimelineIdsRef.current.add(session.sourceEntityId);
    for (const id of affectedMilestoneIds) savingMilestoneIdsRef.current.add(id);
    setSavingTimelineIds(new Set(savingTimelineIdsRef.current));
    setSavingMilestoneIds(new Set(savingMilestoneIdsRef.current));

    try {
      if (isMove) {
        await onMoveProjectTimeline!({
          timelineId: session.sourceEntityId,
          projectId: session.projectId,
          expectedStartDate: session.originalStartDate,
          expectedEndDate: session.originalEndDate,
          deltaDays: session.deltaDays,
          expectedMilestones: session.originalMilestones,
        });
      } else {
        await onResizeProjectTimeline!({
          timelineId: session.sourceEntityId,
          projectId: session.projectId,
          expectedStartDate: session.originalStartDate,
          expectedEndDate: session.originalEndDate,
          side,
          date: side === 'start' ? session.previewStartDate : session.previewEndDate,
        });
      }
    } catch {
      // The save-first runtime keeps every affected entity unchanged on failure.
    } finally {
      savingTimelineIdsRef.current.delete(session.sourceEntityId);
      for (const id of affectedMilestoneIds) savingMilestoneIdsRef.current.delete(id);
      setSavingTimelineIds(new Set(savingTimelineIdsRef.current));
      setSavingMilestoneIds(new Set(savingMilestoneIdsRef.current));
      setProjectBarDragSession(null);
    }
  }, [onMoveProjectTimeline, onResizeProjectTimeline, releaseProjectBarPointer]);

  const beginProjectBarSession = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
    session: ProjectBarMoveSession | ProjectBarResizeSession,
  ) => {
    event.stopPropagation();
    dragEdgeExtensionGateRef.current = EMPTY_TIMELINE_EDGE_EXTENSION_GATE;
    projectBarDragRef.current = session;
    projectBarDragElementRef.current = event.currentTarget;
    setProjectBarDragSession(session);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      cancelProjectBarDrag(event.pointerId);
    }
  }, [cancelProjectBarDrag]);

  const handleProjectBarPointerDown = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
    timeline: Parameters<typeof createProjectBarMoveSession>[0],
    milestones: Parameters<typeof createProjectBarMoveSession>[1],
  ) => {
    if (
      event.button !== 0
      || !event.isPrimary
      || !onMoveProjectTimeline
      || event.target instanceof Element && event.target.closest('[data-project-resize-handle]')
      || projectBarDragRef.current
      || milestoneDragRef.current
      || timelinePanRef.current.isPointerDown
      || scrollbarDragRef.current.active
      || savingTimelineIdsRef.current.has(timeline.id)
      || milestones.some((milestone) => savingMilestoneIdsRef.current.has(milestone.id))
    ) return;
    beginProjectBarSession(
      event,
      createProjectBarMoveSession(timeline, milestones, event.pointerId, event.clientX),
    );
  }, [beginProjectBarSession, onMoveProjectTimeline]);

  const handleProjectBarResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
    timeline: Parameters<typeof createProjectBarResizeSession>[0],
    side: 'start' | 'end',
  ) => {
    if (
      event.button !== 0
      || !event.isPrimary
      || !onResizeProjectTimeline
      || projectBarDragRef.current
      || milestoneDragRef.current
      || timelinePanRef.current.isPointerDown
      || scrollbarDragRef.current.active
      || savingTimelineIdsRef.current.has(timeline.id)
    ) return;
    event.preventDefault();
    beginProjectBarSession(
      event,
      createProjectBarResizeSession(timeline, side, event.pointerId, event.clientX),
    );
  }, [beginProjectBarSession, onResizeProjectTimeline]);

  const handleProjectBarPointerMove = useCallback((
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const current = projectBarDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const next = current.type === 'project-bar-move'
      ? updateProjectBarMovePreview(current, event.clientX, header.coordinates)
      : updateProjectBarResizePreview(current, event.clientX, header.coordinates);
    if (!current.hasExceededDragThreshold && next.hasExceededDragThreshold) {
      quickCardController.closeQuickCardOnInteractionStart(
        next.type === 'project-bar-move' ? 'project-drag' : 'project-resize',
      );
      window.getSelection()?.removeAllRanges();
    }
    projectBarDragRef.current = next;
    setProjectBarDragSession(next);
    if (!next.hasExceededDragThreshold) return;
    event.preventDefault();
    extendTimelineForDragPointer(event.clientX);
  }, [extendTimelineForDragPointer, header.coordinates, quickCardController]);

  const handleProjectBarPointerUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (projectBarDragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (projectBarDragRef.current.hasExceededDragThreshold) {
      suppressedClickRef.current = {
        kind: 'timeline', id: projectBarDragRef.current.sourceEntityId, until: Date.now() + 500,
      };
      event.preventDefault();
    }
    void completeProjectBarDrag(event.pointerId);
  }, [completeProjectBarDrag]);

  const handleProjectBarPointerCancel = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    if (projectBarDragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    cancelProjectBarDrag(event.pointerId);
  }, [cancelProjectBarDrag]);

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      if (projectBarDragRef.current?.pointerId === event.pointerId) {
        void completeProjectBarDrag(event.pointerId);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => cancelProjectBarDrag(event.pointerId);
    const handleBlur = () => cancelProjectBarDrag();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !projectBarDragRef.current) return;
      event.preventDefault();
      cancelProjectBarDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      cancelProjectBarDrag();
    };
  }, [cancelProjectBarDrag, completeProjectBarDrag]);

  const projectMoveMilestonePreviewDates = useMemo(() => {
    if (projectBarDragSession?.type !== 'project-bar-move') return undefined;
    return new Map(projectBarDragSession.originalMilestones.map((milestone) => [
      milestone.id,
      addTimelineDays(milestone.date, projectBarDragSession.deltaDays),
    ]));
  }, [projectBarDragSession]);

  const deleteMessage = (() => {
    if (!deleteTarget) return '';
    if (deleteTarget.kind === 'project') {
      const project = graph.projects.find((item) => item.id === deleteTarget.projectId);
      const timelineIds = new Set(graph.projectTimelines.filter((item) => item.projectId === deleteTarget.projectId).map((item) => item.id));
      return format(t.projectManagement.deleteProjectWarning, {
        name: project?.name ?? deleteTarget.projectId,
        timelines: String(timelineIds.size),
        milestones: String(graph.milestones.filter((item) => timelineIds.has(item.timelineId)).length),
        memberships: String(graph.projectMemberships.filter((item) => item.projectId === deleteTarget.projectId).length),
      });
    }
    if (deleteTarget.kind === 'timeline') {
      const timeline = graph.projectTimelines.find((item) => item.id === deleteTarget.timelineId);
      return format(t.projectManagement.deleteTimelineWarning, {
        name: timeline?.name ?? deleteTarget.timelineId,
        milestones: String(graph.milestones.filter((item) => item.timelineId === deleteTarget.timelineId).length),
      });
    }
    const milestone = graph.milestones.find((item) => item.id === deleteTarget.milestoneId);
    return format(t.projectManagement.deleteMilestoneWarning, { name: milestone?.title ?? deleteTarget.milestoneId });
  })();

  const confirmDelete = async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true; setDeleteError('');
    try {
      if (deleteTarget.kind === 'project' && onDeleteProject) await onDeleteProject({ projectId: deleteTarget.projectId });
      else if (deleteTarget.kind === 'timeline' && onDeleteProjectTimeline) {
        const timeline = graph.projectTimelines.find((item) => item.id === deleteTarget.timelineId);
        if (!timeline) throw new Error(t.projectManagement.deleteFailed);
        await onDeleteProjectTimeline({ projectId: timeline.projectId, timelineId: timeline.id });
      } else if (deleteTarget.kind === 'milestone' && onDeleteMilestone) {
        const milestone = graph.milestones.find((item) => item.id === deleteTarget.milestoneId);
        if (!milestone) throw new Error(t.projectManagement.deleteFailed);
        await onDeleteMilestone({ milestoneId: milestone.id, projectId: milestone.projectId, timelineId: milestone.timelineId });
      } else throw new Error(t.projectManagement.deleteFailed);
      quickCardController.dismiss('data-change');
      setDrawerTarget(null); setDeleteTarget(null); setMilestoneDragSession(null); setProjectBarDragSession(null);
      milestoneDragRef.current = null; projectBarDragRef.current = null;
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : t.projectManagement.deleteFailed); }
    finally { deletingRef.current = false; }
  };

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
      style={{
        '--project-label-width': `${PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH}px`,
        '--workspace-bottom-bar-height': `${PROJECT_OVERVIEW_BOTTOM_BAR_HEIGHT}px`,
      } as CSSProperties}
      className="timeline-card main-workspace is-read-only"
      aria-label={t.sidebar.projectManagement}
    >
      <div className="timeline-titlebar">
        <div className="timeline-titlebar__identity">
          <h2>{workspaceTitle ?? t.projectManagement.workspaceTitle}</h2>
        </div>
        {onCreateProject ? <button type="button" className="pm-crud-trigger" aria-label={t.projectManagement.createProject} onClick={() => setCreateTarget({ kind: 'project' })}><Plus size={14} aria-hidden="true" />{t.projectManagement.createProject}</button> : null}
      </div>
      <div className="timeline-toolbar">
        <div className="timeline-toolbar__left">
          {toolbarLeading}
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
      <div className="continuous-time-canvas">
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
                onOpenProject={(projectId) => {
                  quickCardController.dismiss('outside-click');
                  setDrawerTarget({ kind: 'project', projectId });
                }}
                onOpenTimeline={openTimelineDrawer}
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
                  const activeBarSession = projectBarDragSession?.sourceEntityId
                    === row.timeline.timelineId
                    ? projectBarDragSession
                    : null;
                  const presentedTimeline = activeBarSession ? {
                    ...row.timeline,
                    startDate: activeBarSession.previewStartDate,
                    endDate: activeBarSession.previewEndDate,
                  } : row.timeline;
                  const geometry = getTimelineBarGeometry(presentedTimeline, header.coordinates);
                  const isBarMoving = activeBarSession?.type === 'project-bar-move'
                    && activeBarSession.hasExceededDragThreshold;
                  const isBarResizing = activeBarSession?.type !== 'project-bar-move'
                    && activeBarSession?.hasExceededDragThreshold;
                  const timelineIdentity = {
                    id: row.timeline.timelineId,
                    projectId: row.timeline.projectId,
                    startDate: row.timeline.startDate,
                    endDate: row.timeline.endDate,
                  };
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
                          data-project-bar-moving={isBarMoving || undefined}
                          data-project-bar-resizing={isBarResizing || undefined}
                          data-preview-start-date={activeBarSession?.previewStartDate}
                          data-preview-end-date={activeBarSession?.previewEndDate}
                          aria-busy={savingTimelineIds.has(row.timeline.timelineId) || undefined}
                          className={`timeline-lane__bar${
                            hoveredTimelineId === row.timeline.timelineId ? ' is-project-hovered' : ''
                          }${isBarMoving ? ' is-dragging' : ''}${isBarResizing ? ' is-resizing' : ''}${
                            savingTimelineIds.has(row.timeline.timelineId) ? ' is-saving' : ''
                          }`}
                          style={geometry}
                          title={`${row.timeline.label}: ${row.timeline.startDate} — ${row.timeline.endDate}`}
                          onPointerDown={onMoveProjectTimeline ? (event) => handleProjectBarPointerDown(
                            event, timelineIdentity, row.timeline.milestones,
                          ) : undefined}
                          onPointerMove={handleProjectBarPointerMove}
                          onPointerUp={handleProjectBarPointerUp}
                          onPointerCancel={handleProjectBarPointerCancel}
                          onLostPointerCapture={handleProjectBarPointerCancel}
                          onClick={() => openTimelineDrawer(row.timeline.timelineId)}
                        >
                          {(['start', 'end'] as const).map((side) => (
                            <span
                              key={side}
                              data-project-resize-handle={side}
                              data-no-timeline-pan
                              className={`timeline-lane__resize-handle timeline-lane__resize-handle--${side}${
                                activeBarSession?.type === `project-bar-resize-${side}` ? ' is-active' : ''
                              }`}
                              onPointerDown={onResizeProjectTimeline ? (event) => handleProjectBarResizePointerDown(
                                event, timelineIdentity, side,
                              ) : undefined}
                              onPointerMove={handleProjectBarPointerMove}
                              onPointerUp={handleProjectBarPointerUp}
                              onPointerCancel={handleProjectBarPointerCancel}
                              onLostPointerCapture={handleProjectBarPointerCancel}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                      ) : null}
                      <TimelineMilestones
                        milestones={row.timeline.milestones}
                        coordinates={header.coordinates}
                        onPreviewEnter={handleMilestonePreviewEnter}
                        onPreviewLeave={(milestoneId) => quickCardController.leave(milestoneId)}
                        dragSession={milestoneDragSession?.timelineId === row.timeline.timelineId
                          ? milestoneDragSession
                          : null}
                        savingMilestoneIds={savingMilestoneIds}
                        onDragPointerDown={onMoveMilestone ? handleMilestoneDragPointerDown : undefined}
                        onDragPointerMove={handleMilestoneDragPointerMove}
                        onDragPointerUp={handleMilestoneDragPointerUp}
                        onDragPointerCancel={handleMilestoneDragPointerCancel}
                        onMilestoneClick={openMilestoneDrawer}
                        previewDatesByMilestoneId={projectMoveMilestonePreviewDates}
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
              className="timeline-custom-scrollbar__thumb"
              data-testid="timeline-custom-scrollbar-thumb"
              ref={scrollbarThumbRef}
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
                const travel = track.getBoundingClientRect().width
                  - scrollbarGeometryRef.current.thumbWidth;
                if (travel <= 0) return;
                const nextScrollLeft = drag.startScrollLeft
                  + ((event.clientX - drag.startX) / travel) * drag.startScrollRange;
                desiredScrollLeftRef.current = nextScrollLeft;
                container.scrollLeft = clamp(
                  nextScrollLeft,
                  0,
                  Math.max(container.scrollWidth - container.clientWidth, 0),
                );
                publishScrollbarGeometry();
                checkAndExtendTimeline(container.scrollLeft, nextScrollLeft, 'scrollbar-drag');
              }}
              onPointerUp={(event) => {
                const container = scrollRef.current;
                scrollbarDragRef.current.active = false;
                desiredScrollLeftRef.current = container?.scrollLeft ?? 0;
                if (container) {
                  checkAndExtendTimeline(
                    container.scrollLeft,
                    desiredScrollLeftRef.current,
                    'scrollbar-drag',
                  );
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
      </div>
      <div data-project-overview-overlay-root>
        {drawerTarget ? (
          <ProjectManagementDrawer
            graph={graph}
            target={drawerTarget}
            onClose={() => setDrawerTarget(null)}
            onUpdateProject={onUpdateProject}
            onUpdateTimeline={onUpdateProjectTimeline}
            onUpdateMilestone={onUpdateMilestone}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
            onChangeMemberRoles={onChangeMemberRoles}
            onSetProjectManager={onSetProjectManager}
            onAddTimeline={onCreateProjectTimeline ? (projectId) => setCreateTarget({ kind: 'timeline', projectId }) : undefined}
            onAddMilestone={onCreateMilestone ? (projectId, timelineId) => setCreateTarget({ kind: 'milestone', projectId, timelineId }) : undefined}
            onRequestDelete={onDeleteProject || onDeleteProjectTimeline || onDeleteMilestone
              ? (target) => { setDeleteError(''); setDeleteTarget(target); }
              : undefined}
          />
        ) : null}
        {createTarget?.kind === 'project' && onCreateProject ? <CreateProjectDialog onClose={() => setCreateTarget(null)} onCreate={async (command) => { await onCreateProject(command); setCreateTarget(null); }} /> : null}
        {createTarget?.kind === 'timeline' && onCreateProjectTimeline ? (() => {
          const project = graph.projects.find((item) => item.id === createTarget.projectId);
          if (!project) return null;
          const existing = new Set(graph.projectTimelines.filter((item) => item.projectId === project.id).map((item) => item.lane));
          const legalLanes = (['OEM', 'Tier1'] as const).filter((lane) => !existing.has(lane));
          return legalLanes.length ? <CreateTimelineDialog projectId={project.id} legalLanes={legalLanes} defaultDates={project} onClose={() => setCreateTarget(null)} onCreate={async (command) => { await onCreateProjectTimeline(command); setCreateTarget(null); }} /> : null;
        })() : null}
        {createTarget?.kind === 'milestone' && onCreateMilestone ? (() => {
          const timeline = graph.projectTimelines.find((item) => item.id === createTarget.timelineId && item.projectId === createTarget.projectId);
          return timeline ? <CreateMilestoneDialog projectId={timeline.projectId} timelineId={timeline.id} defaultDate={timeline.startDate} onClose={() => setCreateTarget(null)} onCreate={async (command) => { await onCreateMilestone(command); setCreateTarget(null); }} /> : null;
        })() : null}
        <ConfirmDialog open={Boolean(deleteTarget)} title={t.projectManagement.confirmDelete} message={deleteError || deleteMessage} confirmText={t.projectManagement.deleteAction} cancelText={t.projectManagement.crudCancel} variant="danger" onConfirm={() => { void confirmDelete(); }} onCancel={() => { if (!deletingRef.current) setDeleteTarget(null); }} />
      </div>
      {quickCardTarget ? (
        <MilestoneQuickCard
          key={`${quickCardTarget.milestoneId}:${quickCardTarget.milestones.length}`}
          target={quickCardTarget}
          projects={graph.projects}
          metricsByMilestoneId={quickCardMetricsByMilestoneId}
          locale={locale}
          labels={{
            singleCard: t.projectManagement.milestoneQuickCard,
            aggregateCard: t.projectManagement.aggregateMilestoneQuickCard,
            plannedDate: t.projectManagement.plannedDate,
            deliverableCompletion: t.projectManagement.deliverableCompletion,
            openIssues: t.projectManagement.openIssues,
            openDetails: t.projectManagement.drawerOpenDetails,
          }}
          onSelectMilestone={handleQuickCardMilestoneSelect}
        />
      ) : null}
    </section>
  );
}
