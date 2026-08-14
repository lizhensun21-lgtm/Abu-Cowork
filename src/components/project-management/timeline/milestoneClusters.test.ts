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
});
