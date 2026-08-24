// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import { TimelineRenderer } from './TimelineRenderer';

function graphFixture(cluster = false): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' }],
    projectTimelines: [
      { id: 'yd', projectId: 'p1', lane: 'YD', name: 'YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] },
      { id: 'oem', projectId: 'p1', lane: 'OEM', name: 'OEM', startDate: '2026-02-01', endDate: '2026-10-31', keyResources: [] },
    ],
    milestones: [
      { id: 'm1', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'First', date: '2026-08-14', code: 'G1', status: 'at_risk' },
      { id: 'm2', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'Second', date: cluster ? '2026-08-14' : '2026-09-14', code: 'G2', status: 'completed' },
      { id: 'other', projectId: 'p1', timelineId: 'oem', lane: 'OEM', title: 'Other', date: '2026-05-01', code: 'G3', status: 'blocked' },
    ],
    persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

function capture(element: HTMLElement) {
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  return element;
}

function down(element: Element, pointerId = 21, clientX = 100) {
  fireEvent.pointerDown(element, {
    pointerId, pointerType: 'mouse', button: 0, isPrimary: true, clientX,
  });
}

function configureEdgeContainer() {
  const container = screen.getByTestId('timeline-scroll-container');
  const body = screen.getByTestId('timeline-workspace-body');
  Object.defineProperties(container, {
    clientWidth: { configurable: true, value: 400 },
    scrollWidth: {
      configurable: true,
      get: () => Number.parseFloat(body.style.width),
    },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ left: 0, right: 400, top: 0, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) }),
    },
  });
  return container;
}

describe('Project Bar Move integration', () => {
  it('extends the right edge once and remains stable without new pointer movement', () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={vi.fn(async () => undefined)} />);
      const workspace = screen.getByTestId('project-timeline-workspace');
      const container = configureEdgeContainer();
      const bar = capture(screen.getByTestId('timeline-bar-yd'));
      const initialEndDate = workspace.dataset.timelineEndDate;
      down(bar, 21, 200);
      fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 395 });
      const extendedEndDate = workspace.dataset.timelineEndDate;
      const extendedScrollLeft = container.scrollLeft;
      expect(extendedEndDate).not.toBe(initialEndDate);

      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineEndDate).toBe(extendedEndDate);
      expect(container.scrollLeft).toBe(extendedScrollLeft);

      fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 395 });
      fireEvent.scroll(container);
      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineEndDate).toBe(extendedEndDate);
      expect(container.scrollLeft).toBe(extendedScrollLeft);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps <=5px a click candidate and commits only after a real drop', async () => {
    const onMoveProjectTimeline = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={onMoveProjectTimeline} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 105 });
    expect(bar).not.toHaveClass('is-dragging');
    fireEvent.pointerUp(bar, { pointerId: 21, isPrimary: true, clientX: 105 });
    expect(onMoveProjectTimeline).not.toHaveBeenCalled();
  });

  it('previews Bar and all owned Milestones with one delta without mutating graph', async () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    const onMoveProjectTimeline = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graph} today="2026-08-15" onMoveProjectTimeline={onMoveProjectTimeline} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    const unrelatedLeft = document.querySelector<HTMLElement>('[data-milestone-id="other"]')!.style.left;
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });

    expect(bar).toHaveClass('is-dragging');
    expect(bar).toHaveAttribute('data-preview-start-date', '2026-01-11');
    expect(bar).toHaveAttribute('data-preview-end-date', '2027-01-10');
    expect(document.querySelector('[data-milestone-id="m1"]')).toHaveAttribute('title', expect.stringContaining('2026-08-24'));
    expect(document.querySelector('[data-milestone-id="m2"]')).toHaveAttribute('title', expect.stringContaining('2026-09-24'));
    expect(document.querySelector<HTMLElement>('[data-milestone-id="other"]')!.style.left).toBe(unrelatedLeft);
    expect(graph).toEqual(before);
    expect(onMoveProjectTimeline).not.toHaveBeenCalled();

    fireEvent.pointerUp(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    await act(async () => undefined);
    expect(onMoveProjectTimeline).toHaveBeenCalledWith({
      timelineId: 'yd', projectId: 'p1',
      expectedStartDate: '2026-01-01', expectedEndDate: '2026-12-31',
      deltaDays: 10,
      expectedMilestones: [{ id: 'm1', date: '2026-08-14' }, { id: 'm2', date: '2026-09-14' }],
    });
  });

  it('does not save when a real gesture returns to deltaDays zero', () => {
    const onMoveProjectTimeline = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={onMoveProjectTimeline} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 100 });
    fireEvent.pointerUp(bar, { pointerId: 21, isPrimary: true, clientX: 100 });
    expect(onMoveProjectTimeline).not.toHaveBeenCalled();
  });

  it('suppresses the click synthesized after Project Bar Move so no Drawer opens', async () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={vi.fn(async () => undefined)} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.pointerUp(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.click(bar);
    await act(async () => undefined);
    expect(screen.queryByTestId('pm-drawer')).not.toBeInTheDocument();
  });

  it('keeps Cluster membership and renders no ghost or duplicate Marker', () => {
    render(<TimelineRenderer graph={graphFixture(true)} today="2026-08-15" onMoveProjectTimeline={vi.fn(async () => undefined)} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    expect(document.querySelector('[data-milestone-id="m1"]')).toHaveAttribute('data-milestone-cluster-size', '2');
    expect(document.querySelectorAll('[data-milestone-id="m1"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-milestone-id="m2"]')).toHaveLength(1);
  });

  it('closes Quick Card on move start and blocks blank-area Pan', () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={vi.fn(async () => undefined)} />);
      fireEvent.pointerEnter(document.querySelector('[data-milestone-id="m1"]')!);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      const container = screen.getByTestId('timeline-scroll-container');
      container.scrollLeft = 200;
      const bar = capture(screen.getByTestId('timeline-bar-yd'));
      down(bar);
      fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      fireEvent.pointerMove(container, { pointerId: 21, isPrimary: true, clientX: 40 });
      expect(container).not.toHaveClass('is-panning');
    } finally {
      vi.useRealTimers();
    }
  });

  it('locks the Timeline and all affected Milestones while one atomic save is pending', async () => {
    let finishSave: (() => void) | undefined;
    const onMoveProjectTimeline = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const onMoveMilestone = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={onMoveProjectTimeline} onMoveMilestone={onMoveMilestone} />);
    const bar = capture(screen.getByTestId('timeline-bar-yd'));
    down(bar);
    fireEvent.pointerMove(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.pointerUp(bar, { pointerId: 21, isPrimary: true, clientX: 146 });
    expect(bar).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-milestone-id="m1"]')).toHaveAttribute('aria-busy', 'true');

    const milestone = capture(document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!);
    down(milestone, 22);
    fireEvent.pointerMove(milestone, { pointerId: 22, isPrimary: true, clientX: 120 });
    fireEvent.pointerUp(milestone, { pointerId: 22, isPrimary: true, clientX: 120 });
    expect(onMoveMilestone).not.toHaveBeenCalled();
    await act(async () => finishSave?.());
    expect(bar).not.toHaveAttribute('aria-busy');
  });
});

describe('Project Bar Resize integration', () => {
  it('extends the left edge once and remains stable without new pointer movement', () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onResizeProjectTimeline={vi.fn(async () => undefined)} />);
      const workspace = screen.getByTestId('project-timeline-workspace');
      const container = configureEdgeContainer();
      const handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
      const initialStartDate = workspace.dataset.timelineStartDate;
      down(handle, 21, 200);
      fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 5 });
      const extendedStartDate = workspace.dataset.timelineStartDate;
      const compensatedScrollLeft = container.scrollLeft;
      expect(extendedStartDate).not.toBe(initialStartDate);

      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineStartDate).toBe(extendedStartDate);
      expect(container.scrollLeft).toBe(compensatedScrollLeft);

      fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 5 });
      fireEvent.scroll(container);
      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineStartDate).toBe(extendedStartDate);
      expect(container.scrollLeft).toBe(compensatedScrollLeft);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['start', 146, '2026-01-11'],
    ['end', 54, '2026-12-21'],
  ] as const)('uses the %s handle without starting Bar Move', async (side, clientX, date) => {
    const onMoveProjectTimeline = vi.fn(async () => undefined);
    const onResizeProjectTimeline = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onMoveProjectTimeline={onMoveProjectTimeline} onResizeProjectTimeline={onResizeProjectTimeline} />);
    const handle = capture(document.querySelector<HTMLElement>(`[data-testid="timeline-bar-yd"] [data-project-resize-handle="${side}"]`)!);
    down(handle);
    fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX });
    expect(screen.getByTestId('timeline-bar-yd')).toHaveClass('is-resizing');
    fireEvent.pointerUp(handle, { pointerId: 21, isPrimary: true, clientX });
    await act(async () => undefined);
    expect(onMoveProjectTimeline).not.toHaveBeenCalled();
    expect(onResizeProjectTimeline).toHaveBeenCalledWith(expect.objectContaining({ side, date }));
  });

  it('suppresses the click synthesized after Resize so no Timeline Drawer opens', async () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onResizeProjectTimeline={vi.fn(async () => undefined)} />);
    const handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
    down(handle);
    fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.pointerUp(handle, { pointerId: 21, isPrimary: true, clientX: 146 });
    fireEvent.click(handle);
    await act(async () => undefined);
    expect(screen.queryByTestId('pm-drawer')).not.toBeInTheDocument();
  });

  it('keeps every Milestone date fixed and clamps crossing without swapping', () => {
    const graph = graphFixture();
    render(<TimelineRenderer graph={graph} today="2026-08-15" onResizeProjectTimeline={vi.fn(async () => undefined)} />);
    const originalMarkerLeft = document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!.style.left;
    const handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
    down(handle);
    fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 10000 });
    const bar = screen.getByTestId('timeline-bar-yd');
    expect(bar.dataset.previewStartDate).toBe(bar.dataset.previewEndDate);
    expect(document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!.style.left).toBe(originalMarkerLeft);
  });

  it('does not save a no-op Resize and rolls preview back on command failure', async () => {
    const onResizeProjectTimeline = vi.fn().mockRejectedValue(new Error('save failed'));
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onResizeProjectTimeline={onResizeProjectTimeline} />);
    let handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
    down(handle);
    fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 110 });
    fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 100 });
    fireEvent.pointerUp(handle, { pointerId: 21, isPrimary: true, clientX: 100 });
    expect(onResizeProjectTimeline).not.toHaveBeenCalled();

    handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
    down(handle, 22);
    fireEvent.pointerMove(handle, { pointerId: 22, isPrimary: true, clientX: 146 });
    fireEvent.pointerUp(handle, { pointerId: 22, isPrimary: true, clientX: 146 });
    await act(async () => undefined);
    expect(screen.getByTestId('timeline-bar-yd')).not.toHaveClass('is-resizing');
  });

  it('keeps Quick Card closed through a real Resize and the handle never starts Pan', () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-15" onResizeProjectTimeline={vi.fn(async () => undefined)} />);
      fireEvent.pointerEnter(document.querySelector('[data-milestone-id="m1"]')!);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      const handle = capture(document.querySelector<HTMLElement>('[data-testid="timeline-bar-yd"] [data-project-resize-handle="start"]')!);
      down(handle);
      fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 104 });
      fireEvent.pointerMove(handle, { pointerId: 21, isPrimary: true, clientX: 146 });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      const container = screen.getByTestId('timeline-scroll-container');
      fireEvent.pointerMove(container, { pointerId: 21, isPrimary: true, clientX: 40 });
      expect(container).not.toHaveClass('is-panning');
      fireEvent.pointerUp(handle, { pointerId: 21, isPrimary: true, clientX: 146 });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
