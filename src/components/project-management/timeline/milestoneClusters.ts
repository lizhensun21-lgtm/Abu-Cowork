export interface MilestoneClusterInput {
  readonly id: string;
  readonly markerX: number;
  readonly labelWidth: number;
  readonly clusterLabelWidth?: number;
  readonly collisionLabelWidth?: number;
  readonly groupKey?: string;
  readonly stableOrder?: number;
}

export interface MilestoneClusterLayout {
  readonly clusterId: string;
  readonly clusterIndex: number;
  readonly clusterSize: number;
  readonly visualOrder: number;
  readonly isPrimary: boolean;
  readonly markerVisualOffset: number;
  readonly labelLeft: number;
  readonly labelWidth: number;
  readonly textWidth: number;
}

export interface MilestoneClusterResult {
  readonly groups: ReadonlyMap<string, readonly string[]>;
  readonly layouts: ReadonlyMap<string, MilestoneClusterLayout>;
}

export interface MilestoneLabelBounds {
  readonly left: number;
  readonly right: number;
}

export const MILESTONE_CLUSTER_DISTANCE_PX = 22;
export const MILESTONE_LABEL_COLLISION_GAP_PX = 4;

type PositionedMilestone = MilestoneClusterInput & { readonly sourceOrder: number };

export function milestoneClusterAdditionalCount(clusterSize: number) {
  return Math.max(clusterSize - 1, 0);
}

function clusterCountWidth(clusterSize: number) {
  const additionalCount = milestoneClusterAdditionalCount(clusterSize);
  return additionalCount > 0 ? 12 + String(additionalCount).length * 5 : 0;
}

function shrinkPairWidths(
  widths: number[],
  minimumWidths: readonly number[],
  leftIndex: number,
  rightIndex: number,
  requestedReduction: number,
) {
  let remainingReduction = Math.max(requestedReduction, 0);
  const widerIndex = widths[leftIndex] >= widths[rightIndex] ? leftIndex : rightIndex;
  const narrowerIndex = widerIndex === leftIndex ? rightIndex : leftIndex;
  const equalizingReduction = Math.min(
    remainingReduction,
    Math.max(
      widths[widerIndex] - Math.max(widths[narrowerIndex], minimumWidths[widerIndex]),
      0,
    ),
  );
  widths[widerIndex] -= equalizingReduction;
  remainingReduction -= equalizingReduction;

  if (remainingReduction <= 0) return 0;
  const leftCapacity = Math.max(widths[leftIndex] - minimumWidths[leftIndex], 0);
  const rightCapacity = Math.max(widths[rightIndex] - minimumWidths[rightIndex], 0);
  const totalCapacity = leftCapacity + rightCapacity;
  if (totalCapacity <= 0) return remainingReduction;

  const leftReduction = Math.min(
    leftCapacity,
    remainingReduction * (leftCapacity / totalCapacity),
  );
  widths[leftIndex] -= leftReduction;
  remainingReduction -= leftReduction;
  const rightReduction = Math.min(rightCapacity, remainingReduction);
  widths[rightIndex] -= rightReduction;
  remainingReduction -= rightReduction;

  if (remainingReduction > 0) {
    const finalLeftReduction = Math.min(
      Math.max(widths[leftIndex] - minimumWidths[leftIndex], 0),
      remainingReduction,
    );
    widths[leftIndex] -= finalLeftReduction;
    remainingReduction -= finalLeftReduction;
  }
  return remainingReduction;
}

/** Builds transient visual clusters from current marker screen coordinates. */
export function buildMilestoneClusterLayout(
  milestones: readonly MilestoneClusterInput[],
  markerNodeWidth: number,
  labelBounds?: MilestoneLabelBounds,
): MilestoneClusterResult {
  const sorted: PositionedMilestone[] = milestones
    .map((milestone, sourceOrder) => ({ ...milestone, sourceOrder }))
    .sort((left, right) => (
      left.markerX - right.markerX
      || (left.stableOrder ?? left.sourceOrder) - (right.stableOrder ?? right.sourceOrder)
      || left.sourceOrder - right.sourceOrder
    ));
  const clusters: PositionedMilestone[][] = [];
  const visualOrderById = new Map(sorted.map((milestone, index) => [milestone.id, index]));

  for (const milestone of sorted) {
    const currentCluster = clusters.at(-1);
    const previousMilestone = currentCluster?.at(-1);
    if (
      currentCluster
      && previousMilestone
      && (milestone.groupKey ?? '') === (previousMilestone.groupKey ?? '')
      && milestone.markerX - previousMilestone.markerX <= MILESTONE_CLUSTER_DISTANCE_PX
    ) currentCluster.push(milestone);
    else clusters.push([milestone]);
  }

  const groups = new Map<string, readonly string[]>();
  const layouts = new Map<string, MilestoneClusterLayout>();
  const visibleLabels: Array<{
    milestone: PositionedMilestone;
    centerX: number;
    countWidth: number;
    desiredLabelWidth: number;
  }> = [];

  for (const cluster of clusters) {
    const clusterId = cluster[0].id;
    const clusterCenterX = (cluster[0].markerX + cluster[cluster.length - 1].markerX) / 2;
    groups.set(clusterId, Object.freeze(cluster.map((milestone) => milestone.id)));
    cluster.forEach((milestone, clusterIndex) => {
      const isPrimary = clusterIndex === 0;
      const textWidth = isPrimary && cluster.length > 1
        ? milestone.clusterLabelWidth ?? milestone.collisionLabelWidth ?? milestone.labelWidth
        : milestone.collisionLabelWidth ?? milestone.labelWidth;
      const countWidth = isPrimary ? clusterCountWidth(cluster.length) : 0;
      const labelWidth = textWidth + countWidth;
      layouts.set(milestone.id, Object.freeze({
        clusterId,
        clusterIndex,
        clusterSize: cluster.length,
        visualOrder: visualOrderById.get(milestone.id) ?? 0,
        isPrimary,
        markerVisualOffset: cluster.length > 1 && isPrimary
          ? clusterCenterX - milestone.markerX
          : 0,
        labelLeft: markerNodeWidth / 2 - labelWidth / 2,
        labelWidth,
        textWidth,
      }));
      if (isPrimary) {
        visibleLabels.push({
          milestone, centerX: clusterCenterX, countWidth, desiredLabelWidth: labelWidth,
        });
      }
    });
  }

  const resolvedWidths = visibleLabels.map((label) => label.desiredLabelWidth);
  const preferredMinimumWidths = visibleLabels.map((label) => label.countWidth + 12);
  const hardMinimumWidths = visibleLabels.map((label) => label.countWidth);
  if (labelBounds) {
    visibleLabels.forEach((label, index) => {
      const boundaryWidth = Math.max(Math.min(
        (label.centerX - labelBounds.left) * 2,
        (labelBounds.right - label.centerX) * 2,
      ), 0);
      resolvedWidths[index] = Math.min(resolvedWidths[index], boundaryWidth);
    });
  }
  visibleLabels.forEach((current, index) => {
    if (index === 0) return;
    const previous = visibleLabels[index - 1];
    const maximumCombinedWidth = Math.max(
      (current.centerX - previous.centerX - MILESTONE_LABEL_COLLISION_GAP_PX) * 2,
      0,
    );
    const requiredReduction = resolvedWidths[index - 1] + resolvedWidths[index]
      - maximumCombinedWidth;
    if (requiredReduction <= 0) return;
    const remainingReduction = shrinkPairWidths(
      resolvedWidths, preferredMinimumWidths, index - 1, index, requiredReduction,
    );
    if (remainingReduction > 0) {
      shrinkPairWidths(
        resolvedWidths, hardMinimumWidths, index - 1, index, remainingReduction,
      );
    }
  });
  visibleLabels.forEach((label, index) => {
    const layout = layouts.get(label.milestone.id);
    if (!layout) return;
    const labelWidth = Math.max(resolvedWidths[index], label.countWidth);
    layouts.set(label.milestone.id, Object.freeze({
      ...layout,
      labelLeft: markerNodeWidth / 2 - labelWidth / 2,
      labelWidth,
      textWidth: Math.max(labelWidth - label.countWidth, 0),
    }));
  });
  return Object.freeze({ groups, layouts });
}
