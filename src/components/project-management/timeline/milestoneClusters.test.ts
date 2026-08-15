import { describe, expect, it } from 'vitest';

import { createTimelineCoordinates } from '@/project-management/timeline';
import {
  buildMilestoneClusterLayout,
  MILESTONE_CLUSTER_DISTANCE_PX,
  milestoneClusterAdditionalCount,
} from './milestoneClusters';

const NODE_WIDTH = 28;

describe('Milestone screen-distance clusters', () => {
  it('clusters at the inclusive 22px threshold and separates beyond it', () => {
    const clustered = buildMilestoneClusterLayout([
      { id: 'a', markerX: 100, labelWidth: 40 },
      { id: 'b', markerX: 100 + MILESTONE_CLUSTER_DISTANCE_PX, labelWidth: 40 },
    ], NODE_WIDTH);
    expect(clustered.groups.get('a')).toEqual(['a', 'b']);
    expect(clustered.layouts.get('a')).toMatchObject({ isPrimary: true, clusterSize: 2 });
    expect(clustered.layouts.get('b')).toMatchObject({ isPrimary: false, clusterSize: 2 });

    const separated = buildMilestoneClusterLayout([
      { id: 'a', markerX: 100, labelWidth: 40 },
      { id: 'b', markerX: 123, labelWidth: 40 },
    ], NODE_WIDTH);
    expect(separated.groups.get('a')).toEqual(['a']);
    expect(separated.groups.get('b')).toEqual(['b']);
  });

  it('builds a stable three-marker cluster and reports additional members', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'third', markerX: 141, stableOrder: 3, labelWidth: 30 },
      { id: 'first', markerX: 100, stableOrder: 1, labelWidth: 30 },
      { id: 'second', markerX: 120, stableOrder: 2, labelWidth: 30 },
    ], NODE_WIDTH);
    expect(layout.groups.get('first')).toEqual(['first', 'second', 'third']);
    expect(milestoneClusterAdditionalCount(3)).toBe(2);
  });

  it('never clusters projections from different projects or timelines', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'project-a-yd', markerX: 100, groupKey: 'project-a:yd', labelWidth: 40 },
      { id: 'project-a-oem', markerX: 101, groupKey: 'project-a:oem', labelWidth: 40 },
      { id: 'project-b-yd', markerX: 102, groupKey: 'project-b:yd', labelWidth: 40 },
    ], NODE_WIDTH);
    expect([...layout.groups.values()]).toEqual([
      ['project-a-yd'], ['project-a-oem'], ['project-b-yd'],
    ]);
  });

  it('merges when zoomed out and splits when zoomed in using shared dateToX coordinates', () => {
    const layoutAt = (pxPerDay: number) => {
      const coordinates = createTimelineCoordinates('2026-01-01', '2026-12-31', pxPerDay);
      return buildMilestoneClusterLayout([
        { id: 'earlier', markerX: coordinates.dateToX('2026-04-01'), labelWidth: 40 },
        { id: 'later', markerX: coordinates.dateToX('2026-04-05'), labelWidth: 40 },
      ], NODE_WIDTH);
    };
    expect(layoutAt(4.6).groups.get('earlier')).toEqual(['earlier', 'later']);
    expect(layoutAt(6.2).groups.get('earlier')).toEqual(['earlier']);
    expect(layoutAt(6.2).groups.get('later')).toEqual(['later']);
  });

  it('centers the aggregate marker and label without mutating inputs', () => {
    const source = [
      { id: 'a', markerX: 100, labelWidth: 40 },
      { id: 'b', markerX: 120, labelWidth: 40 },
    ];
    const before = structuredClone(source);
    const layout = buildMilestoneClusterLayout(source, NODE_WIDTH);
    const primary = layout.layouts.get('a')!;
    expect(primary.markerVisualOffset).toBe(10);
    const globalLabelCenter = 100 + primary.markerVisualOffset
      - NODE_WIDTH / 2 + primary.labelLeft + primary.labelWidth / 2;
    expect(globalLabelCenter).toBe(110);
    expect(source).toEqual(before);
  });

  it('keeps independent overlapping labels at natural width and stacks the later one above', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'g3', markerX: 100, stableOrder: 0, labelWidth: 118 },
      { id: 'g4', markerX: 123, stableOrder: 1, labelWidth: 108 },
    ], NODE_WIDTH, { left: 0, right: 300 });

    expect(layout.groups.get('g3')).toEqual(['g3']);
    expect(layout.groups.get('g4')).toEqual(['g4']);
    expect(layout.layouts.get('g3')).toMatchObject({
      labelWidth: 118,
      textWidth: 118,
      labelStackOrder: 0,
      isCoveredByNextLabel: true,
      coveredWidth: 90,
    });
    expect(layout.layouts.get('g4')).toMatchObject({
      labelWidth: 108,
      textWidth: 108,
      labelStackOrder: 1,
      isCoveredByNextLabel: false,
      coveredWidth: 0,
    });
  });

  it('uses stable order and id as deterministic same-position stacking tie-breakers', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'z', markerX: 100, groupKey: 'a', stableOrder: 1, labelWidth: 80 },
      { id: 'b', markerX: 100, groupKey: 'b', stableOrder: 0, labelWidth: 80 },
      { id: 'a', markerX: 100, groupKey: 'c', stableOrder: 0, labelWidth: 80 },
    ], NODE_WIDTH);

    expect(layout.layouts.get('a')?.labelStackOrder).toBe(0);
    expect(layout.layouts.get('b')?.labelStackOrder).toBe(1);
    expect(layout.layouts.get('z')?.labelStackOrder).toBe(2);
  });

  it('only truncates a label at a real viewport boundary', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'inside', markerX: 100, labelWidth: 100 },
      { id: 'edge', markerX: 190, labelWidth: 100 },
    ], NODE_WIDTH, { left: 0, right: 200 });

    expect(layout.layouts.get('inside')?.labelWidth).toBe(100);
    expect(layout.layouts.get('edge')).toMatchObject({ labelWidth: 20, textWidth: 20 });
  });

  it('leaves non-overlapping labels unmasked', () => {
    const layout = buildMilestoneClusterLayout([
      { id: 'g2', markerX: 100, labelWidth: 80 },
      { id: 'g3', markerX: 220, labelWidth: 80 },
    ], NODE_WIDTH, { left: 0, right: 300 });

    expect(layout.layouts.get('g2')).toMatchObject({
      isCoveredByNextLabel: false,
      coveredWidth: 0,
    });
  });

  it('restores independent label widths after a zoom-out cluster is split again', () => {
    const layoutAt = (distance: number) => buildMilestoneClusterLayout([
      { id: 'earlier', markerX: 100, labelWidth: 100 },
      { id: 'later', markerX: 100 + distance, labelWidth: 100 },
    ], NODE_WIDTH, { left: 0, right: 300 });

    const zoomedIn = layoutAt(23);
    const zoomedOut = layoutAt(22);
    const restored = layoutAt(23);
    expect(zoomedIn.layouts.get('later')).toMatchObject({ clusterSize: 1, labelWidth: 100 });
    expect(zoomedOut.groups.get('earlier')).toEqual(['earlier', 'later']);
    expect(zoomedOut.layouts.get('later')).toMatchObject({ clusterSize: 2, isPrimary: false });
    expect(restored.layouts.get('later')).toMatchObject({ clusterSize: 1, labelWidth: 100 });
  });
});
