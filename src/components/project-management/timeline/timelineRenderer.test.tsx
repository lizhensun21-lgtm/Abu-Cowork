import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createTimelineCoordinates } from '@/project-management/timeline';
import type { ProjectGraph } from '@/project-management/domain';
import { getTimelineBarGeometry } from './barGeometry';
import { buildTimelineHeader } from './header';
import {
  createProjectManagementLayoutRows,
  PROJECT_SUMMARY_ROW_HEIGHT,
  TIMELINE_LANE_ROW_HEIGHT,
} from './rowLayout';
import { TimelineRenderer } from './TimelineRenderer';
import { selectProjectListRows } from '@/project-management/application';
import { selectTimelineRows } from '@/project-management/timeline';

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
    milestones: [{ id: 'gate', projectId: 'project-a', timelineId: 'a-yd', lane: 'YD', title: 'Gate', date: '2026-04-01', code: 'G1', status: 'not_started' }],
    persons: [], projectMemberships: [],
    projectTeams: [{ projectId: 'project-b' }, { projectId: 'project-a' }],
  };
}

describe('read-only Timeline Renderer', () => {
  it('renders Project List and Timeline in the same canonical project and lane order', () => {
    render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    expect(screen.getByTestId('project-timeline-workspace')).toBeInTheDocument();
    const rowKeys = Array.from(document.querySelectorAll('[data-testid^="timeline-layout-row-"]'))
      .map((element) => element.getAttribute('data-testid'));
    expect(rowKeys).toEqual([
      'timeline-layout-row-project:project-b',
      'timeline-layout-row-timeline:b-yd',
      'timeline-layout-row-project:project-a',
      'timeline-layout-row-timeline:a-yd',
      'timeline-layout-row-timeline:a-tier1',
      'timeline-layout-row-timeline:a-oem',
    ]);
  });

  it('uses one row layout contract for Project List and Timeline vertical alignment', () => {
    render(<TimelineRenderer graph={graphFixture()} />);
    for (const key of ['project:project-a', 'timeline:a-yd', 'timeline:a-tier1', 'timeline:a-oem']) {
      const listRow = screen.getByTestId(key.startsWith('project:')
        ? 'project-list-row-project-a'
        : `project-list-layout-row-${key}`);
      const timelineRow = screen.getByTestId(`timeline-layout-row-${key}`);
      expect(listRow.style.height).toBe(timelineRow.style.height);
    }
  });

  it('positions bars through Phase 6A coordinates without rendering milestones or mutations', () => {
    const graph = graphFixture();
    const before = structuredClone(graph);
    render(<TimelineRenderer graph={graph} />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const coordinates = createTimelineCoordinates(
      workspace.dataset.timelineStartDate!, workspace.dataset.timelineEndDate!, 4.6,
    );
    const bar = screen.getByTestId('timeline-bar-a-yd');
    expect(Number.parseFloat(bar.style.left)).toBeCloseTo(coordinates.dateToX('2026-01-01'));
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo(
      coordinates.dateToX('2026-12-31') - coordinates.dateToX('2026-01-01'),
    );
    expect(document.querySelector('[data-milestone-id]')).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    expect(graph).toEqual(before);
  });

  it('renders a Today line only when today is inside the actual derived range', () => {
    const { rerender } = render(<TimelineRenderer graph={graphFixture()} today="2026-08-13" />);
    expect(screen.getByTestId('timeline-today-line-header')).toBeInTheDocument();
    rerender(<TimelineRenderer graph={graphFixture()} today="2035-01-01" />);
    expect(screen.queryByTestId('timeline-today-line-header')).not.toBeInTheDocument();
  });

  it('does not depend on Repository, Desktop projectStore, mockData, or interaction handlers', () => {
    const files = ['TimelineRenderer.tsx', 'TimelineHeader.tsx', 'rowLayout.ts', 'header.ts', 'barGeometry.ts'];
    const source = files.map((file) => readFileSync(resolve('src/components/project-management/timeline', file), 'utf8')).join('\n');
    expect(source).not.toMatch(/Repository|stores\/projectStore|types\/project|mockData/);
    expect(source).not.toMatch(/onPointer|onMouse|onWheel|draggable|resize-handle|milestone/i);
    expect(source).not.toMatch(/commitProjectManagementGraph|setState|setGraph/);
  });
});

describe('Timeline Renderer layout helpers', () => {
  it('builds Project, YD, Tier1, OEM rows from shared selectors without parallel order state', () => {
    const graph = graphFixture();
    const rows = createProjectManagementLayoutRows(selectProjectListRows(graph), selectTimelineRows(graph));
    expect(rows.map((row) => row.kind === 'project' ? row.project.projectId : row.timeline.lane)).toEqual([
      'project-b', 'YD', 'project-a', 'YD', 'Tier1', 'OEM',
    ]);
    expect(rows[0].height).toBe(PROJECT_SUMMARY_ROW_HEIGHT);
    expect(rows[1].height).toBe(TIMELINE_LANE_ROW_HEIGHT);
  });

  it('builds month header segments and ticks with January carrying the year', () => {
    const header = buildTimelineHeader({ startDate: '2025-12-01', endDate: '2026-02-28' }, 'month', 4.6);
    expect(header.months.map((month) => month.label)).toEqual(['DEC', 'JAN 2026', 'FEB']);
    expect(header.ticks.map((tick) => tick.label)).toEqual(['1', '1', '1']);
    expect(header.months[1].left).toBe(header.coordinates.dateToX('2026-01-01'));
  });

  it('returns no bar geometry when either source date is missing', () => {
    const coordinates = createTimelineCoordinates('2026-01-01', '2026-12-31', 4.6);
    expect(getTimelineBarGeometry({ startDate: '2026-01-01' }, coordinates)).toBeNull();
    expect(getTimelineBarGeometry({ endDate: '2026-12-31' }, coordinates)).toBeNull();
  });
});
