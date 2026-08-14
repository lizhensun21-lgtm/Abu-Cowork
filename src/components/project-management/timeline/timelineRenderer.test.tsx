import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import {
  addTimelineMonths,
  createTimelineCoordinates,
  timelineDaysBetween,
} from '@/project-management/timeline';
import {
  createProjectOverviewDisplayRows,
  createProjectOverviewViewModel,
  PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH,
  PROJECT_OVERVIEW_ROW_HEIGHT,
} from '../projectOverviewAdapter';
import { getTimelineBarGeometry } from './barGeometry';
import { buildTimelineHeader } from './header';
import { TimelineRenderer } from './TimelineRenderer';

function graphFixture(): ProjectGraph {
  return {
    projects: [
      { id: 'project-b', name: 'Beta', projectCode: 'PM-002', projectStatus: 'planning', startDate: '2026-02-01', endDate: '2026-11-30' },
      { id: 'project-a', name: 'Alpha', projectCode: 'PM-001', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' },
    ],
    projectTimelines: [
      { id: 'b-yd', projectId: 'project-b', lane: 'YD', name: 'Beta YD', startDate: '2026-02-01', endDate: '2026-11-30', keyResources: [] },
      { id: 'a-oem', projectId: 'project-a', lane: 'OEM', name: 'Alpha OEM', startDate: '2026-03-01', endDate: '2026-10-15', keyResources: [] },
      { id: 'a-tier1', projectId: 'project-a', lane: 'Tier1', name: 'Alpha Tier1', startDate: '2026-02-15', endDate: '2026-11-01', keyResources: [] },
      { id: 'a-yd', projectId: 'project-a', lane: 'YD', name: 'Alpha YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
    ],
    milestones: [{ id: 'gate', projectId: 'project-a', timelineId: 'a-yd', lane: 'YD', title: 'G1 Gate', date: '2026-04-01', code: 'G1', status: 'completed' }],
    persons: [{ id: 'person-a', name: 'Alex Chen' }],
    projectMemberships: [{
      id: 'project-a::person-a', projectId: 'project-a', personId: 'person-a',
      roles: ['project_manager'], status: 'active',
    }],
    projectTeams: [{ projectId: 'project-b' }, { projectId: 'project-a' }],
  };
}

describe('Project Overview adapter', () => {
  it('keeps Desktop selectors as the only source and builds YD primary rows with expanded children', () => {
    const view = createProjectOverviewViewModel(graphFixture(), '2026-08-13');
    const rows = createProjectOverviewDisplayRows(view, new Set(['project-a']));
    expect(rows.map((row) => `${row.project.projectId}:${row.timeline.lane}`)).toEqual([
      'project-b:YD', 'project-a:YD', 'project-a:Tier1', 'project-a:OEM',
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 0, 1, 1]);
    expect(view.projects[1].projectManagerName).toBe('Alex Chen');
    expect(view.projects[1].milestoneSummary).toEqual({ completed: 1, total: 1 });
    expect(view.capabilities).toEqual({
      canCreate: false, canEdit: false, canDelete: false, canDrag: false, canResize: false,
    });
  });

  it('collapses Tier1 and OEM without creating a summary row', () => {
    const view = createProjectOverviewViewModel(graphFixture(), '2026-08-13');
    const rows = createProjectOverviewDisplayRows(view, new Set());
    expect(rows.map((row) => row.timeline.lane)).toEqual(['YD', 'YD']);
    expect(rows.every((row) => row.isProjectPrimaryRow)).toBe(true);
  });
});

describe('read-only Project Overview timeline', () => {
  it('renders Project List and Timeline rows in one shared order and layout', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    expect(screen.getByTestId('project-timeline-workspace')).toHaveAttribute('data-timeline-scale', 'week');
    const projectRows = Array.from(document.querySelectorAll('[data-testid^="project-list-row-"]'))
      .map((element) => element.getAttribute('data-timeline-id'));
    const timelineRows = Array.from(document.querySelectorAll('[data-testid^="timeline-layout-row-"]'))
      .map((element) => element.getAttribute('data-timeline-id'));
    expect(projectRows).toEqual(['b-yd', 'a-yd', 'a-tier1', 'a-oem']);
    expect(timelineRows).toEqual(projectRows);
    expect(PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH).toBe(282);
    expect(PROJECT_OVERVIEW_ROW_HEIGHT).toBe(64);
  });

  it('restores the Web title, filter toolbar, and date-based Today presentation', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByText('2 projects')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-01 — 2026-12')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Product category' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Product model' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Timeline scale' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Timeline scale' })).toHaveTextContent('Week');
    expect(document.querySelector('.scale-menu-wrap > .scale-button')).toBeInTheDocument();
    expect(document.querySelector('.today-pill')).toHaveTextContent('Aug 13');
  });

  it('exposes all formal scales and keeps the active dropdown value synchronized', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const scaleButton = screen.getByRole('button', { name: 'Timeline scale' });

    fireEvent.click(scaleButton);
    expect(screen.getAllByRole('menuitemradio').map((option) => option.textContent)).toEqual([
      'Year', 'Quarter', 'Month', 'Week', 'Day',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Quarter' }));
    expect(scaleButton).toHaveTextContent('Quarter');
    expect(scaleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('project-timeline-workspace')).toHaveAttribute(
      'data-timeline-scale',
      'quarter',
    );
  });

  it('changes only ruler presentation while retaining density, graph, coordinates, and scroll', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    render(<TimelineRenderer graph={graph} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    const bar = screen.getByTestId('timeline-bar-a-yd');
    const todayLine = screen.getByTestId('timeline-today-line-body');
    const monthHighlight = screen.getByTestId('timeline-current-month-highlight-body');
    const thumb = screen.getByTestId('timeline-custom-scrollbar-thumb');
    const track = thumb.parentElement!;
    const initialBodyWidth = body.style.width;
    const initialBarGeometry = { left: bar.style.left, width: bar.style.width };
    const initialTodayLeft = todayLine.style.left;
    const initialHighlightGeometry = {
      left: monthHighlight.style.left,
      width: monthHighlight.style.width,
    };
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
    container.scrollLeft = 275;
    fireEvent.scroll(container);
    const initialThumbGeometry = { left: thumb.style.left, width: thumb.style.width };

    fireEvent.click(screen.getByRole('button', { name: 'Timeline scale' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Year' }));

    expect(workspace).toHaveAttribute('data-timeline-scale', 'year');
    expect(workspace).toHaveAttribute('data-timeline-px-per-day', '4.6');
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '2');
    expect(body.style.width).toBe(initialBodyWidth);
    expect({ left: bar.style.left, width: bar.style.width }).toEqual(initialBarGeometry);
    expect(todayLine.style.left).toBe(initialTodayLeft);
    expect({ left: monthHighlight.style.left, width: monthHighlight.style.width })
      .toEqual(initialHighlightGeometry);
    expect(container.scrollLeft).toBe(275);
    expect({ left: thumb.style.left, width: thumb.style.width }).toEqual(initialThumbGeometry);
    expect(graph).toEqual(before);

    const coordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 4.6,
    );
    const anchorDate = coordinates.xToDate(475);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in timeline' }));
    const zoomedCoordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 6.2,
    );
    expect(workspace).toHaveAttribute('data-timeline-scale', 'year');
    expect(workspace).toHaveAttribute('data-timeline-px-per-day', '6.2');
    expect(container.scrollLeft).toBeCloseTo(zoomedCoordinates.dateToX(anchorDate) - 200);
  });

  it('keeps status filtering as local read-only UI state', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'planning' },
    });
    expect(screen.queryByTestId('project-list-row-a-yd')).not.toBeInTheDocument();
    expect(screen.getByTestId('project-list-row-b-yd')).toBeInTheDocument();
  });

  it('uses only local expand state for Tier1 and OEM visibility', () => {
    render(<TimelineRenderer graph={graphFixture()} />);
    const toggle = screen.getByRole('button', { name: 'Collapse project timelines' });
    fireEvent.click(toggle);
    expect(screen.queryByTestId('project-list-row-a-tier1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-layout-row-a-oem')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand project timelines' }));
    expect(screen.getByTestId('project-list-row-a-tier1')).toBeInTheDocument();
  });

  it('shares the Web hover presentation between a Project row and its Timeline bar', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const projectRow = screen.getByTestId('project-list-row-a-yd');
    const projectBar = screen.getByTestId('timeline-bar-a-yd');

    fireEvent.pointerEnter(projectRow);
    expect(projectRow).toHaveClass('is-project-hovered');
    expect(projectBar).toHaveClass('is-project-hovered');

    fireEvent.pointerLeave(projectRow);
    expect(projectRow).not.toHaveClass('is-project-hovered');
    expect(projectBar).not.toHaveClass('is-project-hovered');
  });

  it('synchronizes native horizontal scroll with the custom scrollbar', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const container = screen.getByTestId('timeline-scroll-container');
    const track = screen.getByTestId('timeline-custom-scrollbar-thumb').parentElement!;
    const thumb = screen.getByTestId('timeline-custom-scrollbar-thumb');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1600 },
    });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });

    container.scrollLeft = 600;
    fireEvent.scroll(container);

    expect(thumb).toHaveStyle({ width: '75px', left: '112.5px' });
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
  });

  it('drags the Abu-Web custom scrollbar thumb across the horizontal range', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const container = screen.getByTestId('timeline-scroll-container');
    const thumb = screen.getByTestId('timeline-custom-scrollbar-thumb');
    const track = thumb.parentElement!;
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1600 },
    });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      width: 300, left: 0, right: 300, top: 0, bottom: 12, height: 12, x: 0, y: 0,
      toJSON: () => ({}),
    });
    Object.assign(thumb, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    container.scrollLeft = 200;
    fireEvent.scroll(container);

    fireEvent.pointerDown(thumb, { pointerId: 1, clientX: 40 });
    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 115 });

    expect(container.scrollLeft).toBe(600);
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
  });

  it('zooms through the Abu-Web density levels around the viewport-center anchor', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    const track = screen.getByTestId('timeline-custom-scrollbar-thumb').parentElement!;
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
    container.scrollLeft = 300;
    fireEvent.scroll(container);

    const range = {
      startDate: workspace.dataset.timelineStartDate!,
      endDate: workspace.dataset.timelineEndDate!,
    };
    const oldCoordinates = createTimelineCoordinates(range.startDate, range.endDate, 4.6);
    const anchorDate = oldCoordinates.xToDate(500);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in timeline' });
    fireEvent.click(zoomIn);

    const newCoordinates = createTimelineCoordinates(range.startDate, range.endDate, 6.2);
    expect(workspace).toHaveAttribute('data-timeline-scale', 'week');
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '3');
    expect(workspace).toHaveAttribute('data-timeline-px-per-day', '6.2');
    expect(container.scrollLeft).toBeCloseTo(newCoordinates.dateToX(anchorDate) - 200);
    expect(document.querySelector('.timeline-ruler-track')).toHaveStyle({
      width: `${newCoordinates.canvasWidth}px`,
    });
    expect(body).toHaveStyle({ width: `${newCoordinates.canvasWidth}px` });
    expect(screen.getByTestId('timeline-today-line-body')).toHaveStyle({
      left: `${newCoordinates.dateToX('2026-08-13')}px`,
    });
    expect(screen.getByTestId('timeline-bar-a-yd')).toHaveStyle({
      left: `${newCoordinates.dateToX('2026-01-01')}px`,
    });

    fireEvent.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    const zoomOut = screen.getByRole('button', { name: 'Zoom out timeline' });
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    expect(zoomOut).toBeDisabled();
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '0');
  });

  it('uses the pointer position as the Abu-Web Ctrl-wheel zoom anchor', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 400, left: 100, right: 500, top: 0, bottom: 300, height: 300, x: 100, y: 0,
      toJSON: () => ({}),
    });
    container.scrollLeft = 300;
    const oldCoordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 4.6,
    );
    const anchorDate = oldCoordinates.xToDate(450);

    const wheelEvent = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperties(wheelEvent, {
      ctrlKey: { value: true },
      metaKey: { value: false },
      clientX: { value: 250 },
      deltaY: { value: -100 },
    });
    fireEvent(container, wheelEvent);

    const newCoordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 6.2,
    );
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '3');
    expect(container.scrollLeft).toBeCloseTo(newCoordinates.dateToX(anchorDate) - 150);
  });

  it('pans the Timeline horizontally with the Abu-Web mouse drag threshold', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const container = screen.getByTestId('timeline-scroll-container');
    fireEvent.click(screen.getByRole('button', { name: 'Timeline scale' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Day' }));
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1600 },
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    container.scrollLeft = 300;
    let frame: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });

    fireEvent.pointerDown(container, {
      pointerId: 2, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 300,
    });
    fireEvent.pointerMove(container, {
      pointerId: 2, pointerType: 'mouse', isPrimary: true, clientX: 296,
    });
    expect(container).not.toHaveClass('is-panning');
    fireEvent.pointerMove(container, {
      pointerId: 2, pointerType: 'mouse', isPrimary: true, clientX: 250,
    });
    frame?.(0);

    expect(container.scrollLeft).toBe(350);
    expect(container).toHaveClass('is-panning');
    expect(screen.getByTestId('project-timeline-workspace')).toHaveAttribute(
      'data-timeline-scale',
      'day',
    );
    fireEvent.pointerUp(container, { pointerId: 2, pointerType: 'mouse', isPrimary: true });
    expect(container).not.toHaveClass('is-panning');
    requestAnimationFrame.mockRestore();
  });

  it('extends twelve months to the past at the 20% edge and preserves visible date geometry', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    render(<TimelineRenderer graph={graph} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    const thumb = screen.getByTestId('timeline-custom-scrollbar-thumb');
    const track = thumb.parentElement!;
    const bar = screen.getByTestId('timeline-bar-a-yd');
    const milestone = document.querySelector<HTMLElement>('[data-milestone-id="gate"]')!;
    const todayLine = screen.getByTestId('timeline-today-line-body');
    const highlight = screen.getByTestId('timeline-current-month-highlight-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 300 });
    const previousStartDate = workspace.dataset.timelineStartDate!;
    const previousEndDate = workspace.dataset.timelineEndDate!;
    const nextStartDate = addTimelineMonths(previousStartDate, -12);
    const prependWidth = timelineDaysBetween(nextStartDate, previousStartDate) * 4.6;
    const beforeGeometry = [bar, milestone, todayLine, highlight]
      .map((element) => Number.parseFloat(element.style.left));

    container.scrollLeft = 60;
    fireEvent.scroll(container);

    expect(workspace).toHaveAttribute('data-timeline-start-date', nextStartDate);
    expect(workspace).toHaveAttribute('data-timeline-end-date', previousEndDate);
    expect(container.scrollLeft).toBeCloseTo(60 + prependWidth);
    const afterGeometry = [bar, milestone, todayLine, highlight]
      .map((element) => Number.parseFloat(element.style.left));
    afterGeometry.forEach((left, index) => {
      expect(left - beforeGeometry[index]).toBeCloseTo(prependWidth);
      expect(left - container.scrollLeft).toBeCloseTo(beforeGeometry[index] - 60);
    });
    expect(Number.parseFloat(thumb.style.width)).toBeLessThan(300);
    expect(graph).toEqual(before);
  });

  it('extends twelve months to the future without moving the viewport or resetting scale and zoom', async () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    render(<TimelineRenderer graph={graph} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Timeline scale' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in timeline' }));
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    const previousEndDate = workspace.dataset.timelineEndDate!;
    const previousGeometry = {
      bar: screen.getByTestId('timeline-bar-a-yd').style.left,
      milestone: document.querySelector<HTMLElement>('[data-milestone-id="gate"]')!.style.left,
      today: screen.getByTestId('timeline-today-line-body').style.left,
      highlight: screen.getByTestId('timeline-current-month-highlight-body').style.left,
    };
    const nearRight = container.scrollWidth - container.clientWidth - 60;
    container.scrollLeft = nearRight;

    fireEvent.scroll(container);
    fireEvent.scroll(container);
    fireEvent.scroll(container);

    expect(workspace).toHaveAttribute(
      'data-timeline-end-date',
      addTimelineMonths(previousEndDate, 12),
    );
    expect(container.scrollLeft).toBeCloseTo(nearRight);
    expect(workspace).toHaveAttribute('data-timeline-scale', 'month');
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '3');
    expect(workspace).toHaveAttribute('data-timeline-px-per-day', '6.2');
    expect({
      bar: screen.getByTestId('timeline-bar-a-yd').style.left,
      milestone: document.querySelector<HTMLElement>('[data-milestone-id="gate"]')!.style.left,
      today: screen.getByTestId('timeline-today-line-body').style.left,
      highlight: screen.getByTestId('timeline-current-month-highlight-body').style.left,
    }).toEqual(previousGeometry);
    expect(graph).toEqual(before);
  });

  it('keeps pan and Shift-wheel scrolling active after a range extension', async () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    container.scrollLeft = 60;
    fireEvent.scroll(container);
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    const afterExtension = container.scrollLeft;
    let panFrame: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      panFrame = callback;
      return 99;
    });
    fireEvent.pointerDown(container, {
      pointerId: 9, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 300,
    });
    fireEvent.pointerMove(container, {
      pointerId: 9, pointerType: 'mouse', isPrimary: true, clientX: 250,
    });
    panFrame?.(0);
    expect(container.scrollLeft).toBeCloseTo(afterExtension + 50);
    fireEvent.pointerUp(container, { pointerId: 9, pointerType: 'mouse', isPrimary: true });

    const shiftWheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperties(shiftWheel, {
      shiftKey: { value: true },
      ctrlKey: { value: false },
      metaKey: { value: false },
      deltaY: { value: 80 },
    });
    fireEvent(container, shiftWheel);
    expect(shiftWheel.defaultPrevented).toBe(false);
    container.scrollLeft += 80;
    fireEvent.scroll(container);
    expect(container.scrollLeft).toBeCloseTo(afterExtension + 130);
    requestAnimationFrame.mockRestore();
  });

  it('centers Today at the active zoom while retaining the independent scale', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: vi.fn((options: ScrollToOptions) => {
        if (options.left !== undefined) container.scrollLeft = options.left;
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Timeline scale' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Year' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in timeline' }));
    container.scrollLeft = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    const coordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!,
      workspace.dataset.timelineEndDate!,
      6.2,
    );
    expect(container.scrollLeft).toBeCloseTo(coordinates.dateToX('2026-08-13') - 200);
    expect(workspace).toHaveAttribute('data-timeline-scale', 'year');
    expect(workspace).toHaveAttribute('data-timeline-zoom-level', '3');
  });

  it('expands a missing Today into range before centering without changing ProjectGraph dates', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    const { rerender } = render(<TimelineRenderer graph={graph} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const body = screen.getByTestId('timeline-workspace-body');
    Object.defineProperties(container, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: {
        configurable: true,
        get: () => Number.parseFloat(body.style.width),
      },
    });
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: vi.fn((options: ScrollToOptions) => {
        if (options.left !== undefined) container.scrollLeft = options.left;
      }),
    });
    rerender(<TimelineRenderer graph={graph} today="2035-06-15" />);
    expect(screen.queryByTestId('timeline-today-line-body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(workspace.dataset.timelineEndDate! >= '2035-06-15').toBe(true);
    expect(screen.getByTestId('timeline-today-line-body')).toBeInTheDocument();
    const coordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!,
      workspace.dataset.timelineEndDate!,
      4.6,
    );
    expect(container.scrollLeft).toBeCloseTo(coordinates.dateToX('2035-06-15') - 200);
    expect(graph).toEqual(before);
  });

  it('positions bars and milestones through Desktop Phase 6A coordinates', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    render(<TimelineRenderer graph={graph} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const coordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 4.6,
    );
    const bar = screen.getByTestId('timeline-bar-a-yd');
    expect(Number.parseFloat(bar.style.left)).toBeCloseTo(coordinates.dateToX('2026-01-01'));
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(
      coordinates.dateToX('2026-12-31') - coordinates.dateToX('2026-01-01'),
    );
    expect(document.querySelector('[data-milestone-id="gate"]')).toHaveStyle({
      left: `${coordinates.dateToX('2026-04-01')}px`,
    });
    expect(graph).toEqual(before);
  });

  it('renders one continuous Today guide in the body and none outside the range', () => {
    const { rerender } = render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    expect(screen.getByTestId('timeline-today-line-header')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-today-line-body')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid^="timeline-today-line-"]')).toHaveLength(2);
    rerender(<TimelineRenderer graph={graphFixture()} today="2035-01-01" />);
    expect(screen.queryByTestId('timeline-today-line-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-today-line-body')).not.toBeInTheDocument();
  });

  it('highlights the complete current calendar month through Phase 6A header coordinates', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const header = buildTimelineHeader({
      startDate: workspace.dataset.timelineStartDate!,
      endDate: workspace.dataset.timelineEndDate!,
    }, 'week', 4.6);
    const august = header.months.find((month) => month.key === '2026-08');
    expect(august).toBeDefined();

    const headerHighlight = screen.getByTestId('timeline-current-month-highlight-header');
    const bodyHighlight = screen.getByTestId('timeline-current-month-highlight-body');
    for (const highlight of [headerHighlight, bodyHighlight]) {
      expect(highlight).toHaveStyle({
        left: `${august!.left}px`,
        width: `${august!.width}px`,
      });
    }
    expect(headerHighlight.parentElement).toHaveClass('timeline-ruler-track');
    expect(bodyHighlight.parentElement).toHaveClass('timeline-background');
    expect(screen.getByTestId('timeline-today-line-body').parentElement).toHaveClass('timeline-grid');
  });

  it('sizes the timeline background from the workspace canvas rather than project row content', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);

    const workspaceBody = screen.getByTestId('timeline-workspace-body');
    const timelineGrid = screen.getByTestId('timeline-grid');
    const projectRows = screen.getByTestId('project-timeline-rows');

    expect(workspaceBody).toHaveStyle({ minHeight: `${4 * 64}px` });
    expect(timelineGrid.style.height).toBe('');
    expect(projectRows).toHaveStyle({ height: `${4 * 64}px` });
    expect(screen.getByTestId('timeline-current-month-highlight-body').parentElement).toHaveClass(
      'timeline-background',
    );

    const css = readFileSync(resolve('src/components/project-management/projectOverview.css'), 'utf8');
    expect(css).toContain('height: calc(100% - var(--timeline-ruler-height));');
    expect(css).toContain('min-height: inherit;');
  });

  it('does not import Web runtime state, persistence, mock data, or Desktop Chat projects', () => {
    const files = [
      resolve('src/components/project-management/projectOverviewAdapter.ts'),
      resolve('src/components/project-management/ProjectList.tsx'),
      resolve('src/components/project-management/timeline/TimelineRenderer.tsx'),
    ];
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/localStorage|projectStorage|mockData|stores\/projectStore|types\/project/);
    expect(source).not.toMatch(/Repository|commitProjectManagementGraph|setState|setGraph/);
    expect(source).not.toMatch(/draggable|resize-handle/);
  });

  it('keeps copied visual rules scoped to the Project Overview root', () => {
    const css = readFileSync(resolve('src/components/project-management/projectOverview.css'), 'utf8');
    expect(css).toContain('[data-project-overview-workspace] .timeline-lane__bar');
    expect(css).toContain('[data-project-overview-workspace] .timeline-meeting-month-highlight');
    expect(css).toContain('background: rgb(118 110 200 / 0.095);');
    expect(css).toContain('--timeline-scroll-thumb: #a6acb4;');
    expect(css).toContain('--timeline-row-hover-bg: rgb(120 125 135 / 0.05);');
    expect(css).toContain('color: #f09a2a;');
    expect(css).not.toMatch(/(^|\n)\s*(html|body|:root|\.sidebar)\s*\{/);
  });
});

describe('Timeline visual helpers', () => {
  const range = { startDate: '2025-12-01', endDate: '2026-05-31' } as const;

  it('builds a year ruler while retaining the independent 4.6 px/day density', () => {
    const header = buildTimelineHeader(range, 'year', 4.6, 30);
    expect(header.segments.map((segment) => segment.label)).toEqual(['2025', '2026']);
    expect(header.ticks.map((tick) => tick.label)).toEqual(['2025', '2026']);
    expect(header.coordinates.pxPerDay).toBe(4.6);
  });

  it('builds a quarter ruler while retaining the independent 4.6 px/day density', () => {
    const header = buildTimelineHeader(range, 'quarter', 4.6, 30);
    expect(header.segments.map((segment) => segment.label)).toEqual([
      'Q4 2025', 'Q1 2026', 'Q2 2026',
    ]);
    expect(header.ticks.map((tick) => tick.label)).toEqual([
      'Q4 2025', 'Q1 2026', 'Q2 2026',
    ]);
    expect(header.coordinates.pxPerDay).toBe(4.6);
  });

  it('builds the Web month ruler while retaining the independent 4.6 px/day density', () => {
    const header = buildTimelineHeader(range, 'month', 4.6, 30);
    expect(header.segments.slice(0, 3).map((segment) => segment.label)).toEqual([
      'DEC', 'JAN 2026', 'FEB',
    ]);
    expect(header.ticks.slice(0, 3).map((tick) => tick.label)).toEqual(['1', '1', '1']);
    expect(header.coordinates.pxPerDay).toBe(4.6);
  });

  it('builds the Web week ruler while retaining the independent 4.6 px/day density', () => {
    const header = buildTimelineHeader(range, 'week', 4.6, 30);
    expect(header.months.slice(0, 3).map((month) => month.label)).toEqual([
      'DEC', 'JAN 2026', 'FEB',
    ]);
    expect(header.ticks.length).toBeGreaterThan(3);
    expect(header.months[1].left).toBe(header.coordinates.dateToX('2026-01-01'));
    expect(header.coordinates.pxPerDay).toBe(4.6);
  });

  it('builds a finer day ruler while retaining the independent 4.6 px/day density', () => {
    const dayHeader = buildTimelineHeader(range, 'day', 4.6, 20);
    const weekHeader = buildTimelineHeader(range, 'week', 4.6, 20);
    expect(dayHeader.segments.slice(0, 3).map((segment) => segment.label)).toEqual([
      'DEC', 'JAN 2026', 'FEB',
    ]);
    expect(dayHeader.ticks.length).toBeGreaterThan(weekHeader.ticks.length);
    expect(dayHeader.ticks[0]).toMatchObject({ key: '2025-12-01', label: '1', left: 0 });
    expect(dayHeader.coordinates.pxPerDay).toBe(4.6);
  });

  it('creates the one coordinate contract only inside the shared header builder', () => {
    const rendererSource = readFileSync(
      resolve('src/components/project-management/timeline/TimelineRenderer.tsx'),
      'utf8',
    );
    const headerSource = readFileSync(
      resolve('src/components/project-management/timeline/header.ts'),
      'utf8',
    );
    expect(rendererSource).not.toContain('createTimelineCoordinates');
    expect(headerSource.match(/createTimelineCoordinates\(/g)).toHaveLength(1);
  });

  it('returns no bar geometry when either source date is missing', () => {
    const coordinates = createTimelineCoordinates('2026-01-01', '2026-12-31', 4.6);
    expect(getTimelineBarGeometry({ startDate: '2026-01-01' }, coordinates)).toBeNull();
    expect(getTimelineBarGeometry({ endDate: '2026-12-31' }, coordinates)).toBeNull();
  });
});
