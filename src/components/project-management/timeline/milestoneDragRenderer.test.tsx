import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import { TimelineRenderer } from './TimelineRenderer';

function graphFixture(cluster = false): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' }],
    projectTimelines: [{ id: 't1', projectId: 'p1', lane: 'YD', name: 'YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] }],
    milestones: [
      { id: 'm1', projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'Gate', date: '2026-08-14', code: 'G1', status: 'at_risk' },
      ...(cluster ? [{ id: 'm2', projectId: 'p1', timelineId: 't1', lane: 'YD' as const, title: 'Peer', date: '2026-08-14', code: 'G2' as const, status: 'completed' as const }] : []),
    ],
    persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

function marker(id = 'm1') {
  const element = document.querySelector<HTMLSpanElement>(`[data-milestone-id="${id}"]`)!;
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  return element;
}

function pointerDown(element: Element, clientX = 100, pointerId = 11) {
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

describe('Timeline Milestone drag integration', () => {
  it('extends an edge once and remains stable across stationary animation frames', () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={vi.fn(async () => undefined)} />);
      const workspace = screen.getByTestId('project-timeline-workspace');
      const container = configureEdgeContainer();
      const node = marker();
      const initialEndDate = workspace.dataset.timelineEndDate;
      pointerDown(node, 200);
      fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 395 });
      const extendedEndDate = workspace.dataset.timelineEndDate;
      const extendedScrollLeft = container.scrollLeft;
      expect(extendedEndDate).not.toBe(initialEndDate);

      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineEndDate).toBe(extendedEndDate);
      expect(container.scrollLeft).toBe(extendedScrollLeft);

      fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 395 });
      fireEvent.scroll(container);
      act(() => vi.advanceTimersByTime(100));
      expect(workspace.dataset.timelineEndDate).toBe(extendedEndDate);
      expect(container.scrollLeft).toBe(extendedScrollLeft);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps sub-threshold movement a click candidate and does not save', () => {
    const onMoveMilestone = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={onMoveMilestone} />);
    const node = marker();
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 105 });
    expect(node).not.toHaveClass('is-dragging');
    fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 105 });
    expect(onMoveMilestone).not.toHaveBeenCalled();
  });

  it('previews only after threshold and commits one narrow command on drop', async () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    const onMoveMilestone = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graph} today="2026-08-14" onMoveMilestone={onMoveMilestone} />);
    const node = marker();
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 110 });

    expect(node).toHaveClass('is-dragging');
    expect(node).toHaveAttribute('data-milestone-preview-date', '2026-08-16');
    expect(graph).toEqual(before);
    expect(onMoveMilestone).not.toHaveBeenCalled();

    fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    await act(async () => undefined);
    expect(onMoveMilestone).toHaveBeenCalledWith({
      milestoneId: 'm1', projectId: 'p1', timelineId: 't1',
      expectedDate: '2026-08-14', date: '2026-08-16',
    });
    expect(graph).toEqual(before);
  });

  it('does not save when an exceeded gesture returns to the original date', () => {
    const onMoveMilestone = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={onMoveMilestone} />);
    const node = marker();
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 100 });
    fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 100 });
    expect(onMoveMilestone).not.toHaveBeenCalled();
  });

  it('closes Quick Card only on actual drag and does not reopen it on drop', async () => {
    vi.useFakeTimers();
    try {
      render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={vi.fn(async () => undefined)} />);
      const node = marker();
      fireEvent.pointerEnter(node);
      act(() => vi.advanceTimersByTime(150));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      pointerDown(node);
      fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 104 });
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 110 });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 110 });
      await act(async () => undefined);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('temporarily removes the dragged member from its cluster without duplicating it', () => {
    render(<TimelineRenderer graph={graphFixture(true)} today="2026-08-14" onMoveMilestone={vi.fn(async () => undefined)} />);
    const node = marker();
    expect(node).toHaveAttribute('data-milestone-cluster-size', '2');
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 130 });
    expect(document.querySelector('[data-milestone-id="m1"]')).toHaveAttribute('data-milestone-cluster-size', '1');
    expect(document.querySelector('[data-milestone-id="m2"]')).toHaveAttribute('data-milestone-cluster-size', '1');
    expect(document.querySelectorAll('[data-milestone-id="m1"]')).toHaveLength(1);
  });

  it('rolls preview back after repository-command failure and unlocks the entity', async () => {
    const onMoveMilestone = vi.fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined);
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={onMoveMilestone} />);
    let node = marker();
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    await act(async () => undefined);
    node = marker();
    expect(node).not.toHaveClass('is-dragging');
    expect(node.style.left).toBeTruthy();

    pointerDown(node, 100, 12);
    fireEvent.pointerMove(node, { pointerId: 12, isPrimary: true, clientX: 110 });
    fireEvent.pointerUp(node, { pointerId: 12, isPrimary: true, clientX: 110 });
    await act(async () => undefined);
    expect(onMoveMilestone).toHaveBeenCalledTimes(2);
  });

  it('locks only the saving milestone until its async commit settles', async () => {
    let finishSave: (() => void) | undefined;
    const onMoveMilestone = vi.fn(() => new Promise<void>((resolve) => {
      finishSave = resolve;
    }));
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" onMoveMilestone={onMoveMilestone} />);
    const node = marker();
    pointerDown(node);
    fireEvent.pointerMove(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    fireEvent.pointerUp(node, { pointerId: 11, isPrimary: true, clientX: 110 });
    expect(node).toHaveAttribute('aria-busy', 'true');

    pointerDown(node, 100, 12);
    fireEvent.pointerMove(node, { pointerId: 12, isPrimary: true, clientX: 120 });
    fireEvent.pointerUp(node, { pointerId: 12, isPrimary: true, clientX: 120 });
    expect(onMoveMilestone).toHaveBeenCalledTimes(1);

    await act(async () => finishSave?.());
    expect(node).not.toHaveAttribute('aria-busy');
  });
});
