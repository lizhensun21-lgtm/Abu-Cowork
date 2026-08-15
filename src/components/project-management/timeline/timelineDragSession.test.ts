import { describe, expect, it } from 'vitest';

import type { TimelineMilestone } from '@/project-management/domain';
import { createTimelineCoordinates } from '@/project-management/timeline';
import {
  createMilestoneDragSession,
  createProjectBarMoveSession,
  createProjectBarResizeSession,
  EMPTY_TIMELINE_EDGE_EXTENSION_GATE,
  evaluateTimelineEdgeExtension,
  TIMELINE_DRAG_THRESHOLD_PX,
  updateMilestoneDragPreview,
  updateProjectBarMovePreview,
  updateProjectBarResizePreview,
} from './timelineDragSession';

const milestone: TimelineMilestone = {
  id: 'm1', projectId: 'p1', timelineId: 't1', lane: 'YD',
  name: 'Gate', date: '2026-03-08', stageGate: 'G1', status: 'at_risk',
};
const coordinates = createTimelineCoordinates('2026-02-01', '2026-04-30', 10);

describe('Timeline milestone drag session', () => {
  it('uses the verified 5px threshold and the existing inverse coordinates', () => {
    const start = createMilestoneDragSession(milestone, 7, 100);
    const clickCandidate = updateMilestoneDragPreview(
      start,
      100 + TIMELINE_DRAG_THRESHOLD_PX,
      coordinates,
    );
    expect(clickCandidate.hasExceededDragThreshold).toBe(false);
    expect(clickCandidate.previewDate).toBe('2026-03-08');

    const drag = updateMilestoneDragPreview(clickCandidate, 116, coordinates);
    expect(drag.hasExceededDragThreshold).toBe(true);
    expect(drag.previewDate).toBe('2026-03-10');
  });

  it('snaps to UTC calendar days without DST drift in either direction', () => {
    const start = createMilestoneDragSession(milestone, 7, 100);
    expect(updateMilestoneDragPreview(start, 110, coordinates).previewDate).toBe('2026-03-09');
    expect(updateMilestoneDragPreview(start, 90, coordinates).previewDate).toBe('2026-03-07');
  });
});

describe('Project Bar drag sessions', () => {
  const timeline = { id: 't1', projectId: 'p1', startDate: '2026-02-10', endDate: '2026-03-10' };

  it('moves start/end with one UTC day delta and preserves duration', () => {
    const start = createProjectBarMoveSession(timeline, [{ id: 'm1', date: '2026-02-20' }], 8, 100);
    expect(updateProjectBarMovePreview(start, 105, coordinates).hasExceededDragThreshold).toBe(false);
    const preview = updateProjectBarMovePreview(start, 120, coordinates);
    expect(preview).toMatchObject({
      hasExceededDragThreshold: true,
      deltaDays: 2,
      previewStartDate: '2026-02-12',
      previewEndDate: '2026-03-12',
    });
  });

  it('uses density, not ruler scale, and keeps the anchor stable after range extension', () => {
    const start = createProjectBarMoveSession(timeline, [], 8, 100);
    const dense = createTimelineCoordinates('2026-01-01', '2026-04-30', 20);
    expect(updateProjectBarMovePreview(start, 120, dense).deltaDays).toBe(1);
    const extended = createTimelineCoordinates('2025-12-01', '2026-04-30', 10);
    expect(updateProjectBarMovePreview(start, 120, extended).previewStartDate).toBe('2026-02-12');
  });

  it('resizes only one side and clamps crossing to a valid same-day range', () => {
    const left = createProjectBarResizeSession(timeline, 'start', 9, 100);
    expect(updateProjectBarResizePreview(left, 120, coordinates)).toMatchObject({
      previewStartDate: '2026-02-12', previewEndDate: '2026-03-10',
    });
    expect(updateProjectBarResizePreview(left, 1000, coordinates)).toMatchObject({
      previewStartDate: '2026-03-10', previewEndDate: '2026-03-10',
    });
    const right = createProjectBarResizeSession(timeline, 'end', 10, 100);
    expect(updateProjectBarResizePreview(right, -1000, coordinates)).toMatchObject({
      previewStartDate: '2026-02-10', previewEndDate: '2026-02-10',
    });
  });
});

describe('Timeline drag edge extension gate', () => {
  it.each(['left', 'right'] as const)(
    'allows one %s extension per real pointer movement, regardless of range revisions',
    (direction) => {
      const first = evaluateTimelineEdgeExtension(
        EMPTY_TIMELINE_EDGE_EXTENSION_GATE,
        12,
        direction,
        direction === 'left' ? '2025-01-01' : '2027-12-31',
      );
      expect(first.shouldExtend).toBe(true);
      expect(first.gate.lastTrigger).toMatchObject({ pointerX: 12, direction });

      const stationaryAfterRangeChange = evaluateTimelineEdgeExtension(
        first.gate,
        12,
        direction,
        direction === 'left' ? '2024-01-01' : '2028-12-31',
      );
      expect(stationaryAfterRangeChange.shouldExtend).toBe(false);

      const moved = evaluateTimelineEdgeExtension(
        stationaryAfterRangeChange.gate,
        13,
        direction,
        direction === 'left' ? '2024-01-01' : '2028-12-31',
      );
      expect(moved.shouldExtend).toBe(true);
    },
  );

  it('rearms after the pointer leaves and then re-enters an edge', () => {
    const first = evaluateTimelineEdgeExtension(
      EMPTY_TIMELINE_EDGE_EXTENSION_GATE,
      12,
      'left',
      '2025-01-01',
    );
    const center = evaluateTimelineEdgeExtension(first.gate, 200, null, null);
    expect(center.shouldExtend).toBe(false);
    expect(evaluateTimelineEdgeExtension(center.gate, 12, 'left', '2024-01-01').shouldExtend)
      .toBe(true);
  });
});
