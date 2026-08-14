import { describe, expect, it } from 'vitest';

import { resolveMilestoneQuickCardPosition, type QuickCardRect } from './milestoneQuickCardPosition';

const boundary: QuickCardRect = { left: 280, top: 90, right: 1000, bottom: 700, width: 720, height: 610 };
const anchor = (left: number, top: number): QuickCardRect => ({
  left, top, right: left + 28, bottom: top + 28, width: 28, height: 28,
});

describe('milestone quick card positioning', () => {
  it('clamps a left-edge card within the timeline boundary', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(280, 300), boundary, previewWidth: 220, previewHeight: 100 }).left)
      .toBe(290);
  });

  it('moves a right-edge card left within the boundary', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(990, 300), boundary, previewWidth: 220, previewHeight: 100 }).left)
      .toBe(770);
  });

  it('places a card above a bottom-edge marker', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(500, 660), boundary, previewWidth: 220, previewHeight: 100 }).placement)
      .toBe('above');
  });

  it('places a card below when upper space is insufficient', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(500, 95), boundary, previewWidth: 220, previewHeight: 100 }).placement)
      .toBe('below');
  });

  it('chooses the larger side when neither side fits', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(500, 500), boundary, previewWidth: 220, previewHeight: 500 }).placement)
      .toBe('above');
  });

  it('respects the titlebar-safe top boundary', () => {
    expect(resolveMilestoneQuickCardPosition({ anchor: anchor(500, 95), boundary, previewWidth: 220, previewHeight: 800 }).top)
      .toBeGreaterThanOrEqual(100);
  });
});
