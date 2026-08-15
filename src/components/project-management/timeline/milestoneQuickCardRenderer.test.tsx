import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import { TimelineRenderer } from './TimelineRenderer';

function graphFixture(cluster = false): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectCode: 'PM-1', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31' }],
    projectTimelines: [{ id: 't1', projectId: 'p1', lane: 'YD', name: 'Alpha YD', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [] }],
    milestones: [
      { id: 'g1', projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'G1 Gate', date: '2026-08-14', code: 'G1', status: 'completed' },
      ...(cluster ? [{ id: 'g2', projectId: 'p1', timelineId: 't1', lane: 'YD' as const, title: 'G2 Release', date: '2026-08-14', code: 'G2' as const, status: 'at_risk' as const }] : []),
    ],
    persons: [], projectMemberships: [], projectTeams: [{ projectId: 'p1' }],
  };
}

function hoverMarker(id = 'g1') {
  fireEvent.pointerEnter(document.querySelector(`[data-milestone-id="${id}"]`)!);
  act(() => vi.advanceTimersByTime(150));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Timeline Milestone Quick Card integration', () => {
  it('opens a single card by hovering the 28px marker hit area', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    expect(screen.getByRole('tooltip', { name: 'Milestone quick card' })).toHaveTextContent('G1 Gate');
    expect(document.querySelector('.milestone-node__marker-hit')).toHaveClass('milestone-node__marker-hit');
  });

  it('opens Milestone Drawer from single Quick Card details and closes the card', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName('Milestone details: G1 Gate');
  });

  it('opens one aggregate card with all cluster members in original order', () => {
    render(<TimelineRenderer graph={graphFixture(true)} today="2026-08-14" />);
    hoverMarker();
    const card = screen.getByRole('dialog', { name: 'Milestone cluster quick card' });
    expect(card).toHaveTextContent('G1 Gate');
    expect(card).toHaveTextContent('G2 Release');
    expect(Array.from(card.querySelectorAll('.milestone-hover-preview__aggregate-title')).map((node) => node.textContent))
      .toEqual(['G1 Gate', 'G2 Release']);
  });

  it('keeps the card visible after leaving the marker and the card', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    fireEvent.pointerLeave(document.querySelector('[data-milestone-id="g1"]')!);
    fireEvent.pointerLeave(screen.getByRole('tooltip'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('opens the selected aggregate member in the single PM Drawer and closes Quick Card', () => {
    render(<TimelineRenderer graph={graphFixture(true)} today="2026-08-14" />);
    hoverMarker();
    fireEvent.click(screen.getByRole('button', { name: /G2 Release/u }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-milestone-popover-root]')).toHaveLength(0);
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName('Milestone details: G2 Release');
  });

  it('does not treat an internal card click as an outside click', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    fireEvent.pointerDown(screen.getByRole('tooltip'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('closes on an outside click and Escape', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    fireEvent.pointerDown(screen.getByTestId('timeline-workspace-body'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    hoverMarker();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes when timeline pan starts', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    fireEvent.pointerDown(screen.getByTestId('timeline-scroll-container'), {
      pointerType: 'mouse', button: 0, isPrimary: true, pointerId: 1, clientX: 500,
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes when zoom starts while preserving the formal zoom behavior', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    const zoomButton = screen.getByRole('button', { name: 'Zoom in timeline' });
    expect(zoomButton).toBeEnabled();
    fireEvent.click(zoomButton);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('uses the shared status resolver for marker and card diamonds', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    const marker = document.querySelector<HTMLElement>('[data-milestone-id="g1"]')!;
    const cardDiamond = screen.getByRole('tooltip').querySelector<SVGElement>('.milestone-hover-preview__identity-status')!;
    expect(marker).toHaveAttribute('data-milestone-visual-status', 'completed');
    expect(cardDiamond.style.getPropertyValue('--milestone-status-fill')).toContain('completed');
  });

  it('keeps ProjectGraph immutable and production sources free of fixture/store imports', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    const { unmount } = render(<TimelineRenderer graph={graph} today="2026-08-14" />);
    hoverMarker();
    unmount();
    expect(graph).toEqual(before);
    const rendererSource = readFileSync(resolve('src/components/project-management/timeline/TimelineRenderer.tsx'), 'utf8');
    const dataSource = readFileSync(resolve('src/components/project-management/timeline/milestoneQuickCardData.ts'), 'utf8');
    expect(`${rendererSource}\n${dataSource}`).not.toMatch(/projectManagementStore|mockData|phaseI4GuiFixture/u);
  });

  it('keeps the card bounded, dynamic-width, truncated, scoped, and pan-blocking', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-14" />);
    hoverMarker();
    const card = screen.getByRole('tooltip');
    expect(card).toHaveAttribute('data-no-timeline-pan');
    expect(card.closest('[data-project-overview-overlay-root]')).toBeInTheDocument();
    const css = readFileSync(resolve('src/components/project-management/projectOverview.css'), 'utf8');
    expect(css).toMatch(/\[data-project-overview-overlay-root\] \.milestone-hover-preview[\s\S]*?width:\s*fit-content/u);
    expect(css).toMatch(/milestone-hover-preview__title[\s\S]*?text-overflow:\s*ellipsis/u);
    expect(css).toMatch(/milestone-hover-preview--single[\s\S]*?max-width:\s*320px/u);
  });
});
