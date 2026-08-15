export interface TimelineScrollbarGeometry {
  readonly maxScrollLeft: number;
  readonly progress: number;
  readonly thumbWidth: number;
  readonly thumbTravel: number;
  readonly thumbLeft: number;
  readonly trackWidth: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateTimelineScrollbarGeometry({
  scrollLeft,
  scrollWidth,
  clientWidth,
  trackWidth,
  minThumbWidth = 44,
}: {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly trackWidth: number;
  readonly minThumbWidth?: number;
}): TimelineScrollbarGeometry {
  const maxScrollLeft = Math.max(scrollWidth - clientWidth, 0);
  const thumbWidth = scrollWidth > 0
    ? Math.max(minThumbWidth, Math.min(trackWidth, trackWidth * clientWidth / scrollWidth))
    : trackWidth;
  const progress = maxScrollLeft > 0 ? clamp(scrollLeft / maxScrollLeft, 0, 1) : 0;
  const thumbTravel = Math.max(trackWidth - thumbWidth, 0);
  return {
    maxScrollLeft,
    progress,
    thumbWidth,
    thumbTravel,
    thumbLeft: progress * thumbTravel,
    trackWidth,
  };
}
