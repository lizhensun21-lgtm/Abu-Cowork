export interface QuickCardRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface MilestoneQuickCardPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: 'above' | 'below';
  readonly maxHeight: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function resolveMilestoneQuickCardPosition({
  anchor,
  boundary,
  previewWidth,
  previewHeight,
  gap = 8,
  edgePadding = 10,
}: {
  readonly anchor: QuickCardRect;
  readonly boundary: QuickCardRect;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly gap?: number;
  readonly edgePadding?: number;
}): MilestoneQuickCardPosition {
  const safeLeft = boundary.left + edgePadding;
  const safeRight = boundary.right - edgePadding;
  const safeTop = boundary.top + edgePadding;
  const safeBottom = boundary.bottom - edgePadding;
  const availableAbove = Math.max(anchor.top - gap - safeTop, 0);
  const availableBelow = Math.max(safeBottom - anchor.bottom - gap, 0);
  const placement = availableAbove >= previewHeight
    || (availableBelow < previewHeight && availableAbove >= availableBelow)
    ? 'above'
    : 'below';
  const maxHeight = placement === 'above' ? availableAbove : availableBelow;
  const unclampedTop = placement === 'above'
    ? anchor.top - gap - Math.min(previewHeight, maxHeight)
    : anchor.bottom + gap;
  return {
    left: clamp(anchor.left + (anchor.width - previewWidth) / 2, safeLeft, Math.max(safeLeft, safeRight - previewWidth)),
    top: clamp(unclampedTop, safeTop, Math.max(safeTop, safeBottom - Math.min(previewHeight, maxHeight))),
    placement,
    maxHeight,
  };
}
