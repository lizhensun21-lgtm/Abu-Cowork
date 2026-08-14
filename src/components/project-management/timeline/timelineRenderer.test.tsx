import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import { createTimelineCoordinates } from '@/project-management/timeline';
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
    expect(screen.getByRole('button', { name: 'Timeline scale' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Timeline scale' })).toHaveTextContent('Year');
    expect(document.querySelector('.scale-menu-wrap > .scale-button')).toBeInTheDocument();
    expect(document.querySelector('.today-pill')).toHaveTextContent('Aug 13');
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
    expect(source).not.toMatch(/onWheel|draggable|resize-handle/);
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
  it('builds a week ruler while retaining the independent 4.6 px/day density', () => {
    const header = buildTimelineHeader({ startDate: '2025-12-01', endDate: '2026-02-28' }, 'week', 4.6);
    expect(header.months.map((month) => month.label)).toEqual(['DEC', 'JAN 2026', 'FEB']);
    expect(header.ticks.length).toBeGreaterThan(3);
    expect(header.months[1].left).toBe(header.coordinates.dateToX('2026-01-01'));
  });

  it('returns no bar geometry when either source date is missing', () => {
    const coordinates = createTimelineCoordinates('2026-01-01', '2026-12-31', 4.6);
    expect(getTimelineBarGeometry({ startDate: '2026-01-01' }, coordinates)).toBeNull();
    expect(getTimelineBarGeometry({ endDate: '2026-12-31' }, coordinates)).toBeNull();
  });
});
