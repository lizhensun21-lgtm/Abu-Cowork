// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TimelineMilestone } from '@/project-management/domain';
import {
  createMilestoneQuickCardController,
  MILESTONE_QUICK_CARD_SHOW_DELAY_MS,
  type MilestoneQuickCardTarget,
} from './milestoneQuickCardController';

const milestone: TimelineMilestone = {
  id: 'g1', projectId: 'p1', timelineId: 't1', lane: 'YD', name: 'Gate', date: '2026-08-14',
};

function target(id = 'g1'): MilestoneQuickCardTarget {
  return { anchorElement: document.createElement('span'), milestoneId: id, milestones: [{ ...milestone, id }] };
}

afterEach(() => vi.useRealTimers());

describe('milestone quick card controller', () => {
  it('uses the validated 150ms opening delay', () => {
    expect(MILESTONE_QUICK_CARD_SHOW_DELAY_MS).toBe(150);
  });

  it('opens a single marker after the delay', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed);
    controller.enter(target());
    vi.advanceTimersByTime(149);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ milestoneId: 'g1' }));
  });

  it('cancels a pending preview when its marker is left', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed);
    controller.enter(target());
    controller.leave('g1');
    vi.runAllTimers();
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps a visible card open after marker leave', () => {
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed, 0);
    controller.open(target());
    controller.leave('g1');
    expect(controller.isOpen()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('switches directly when another marker is entered', () => {
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed);
    controller.open(target());
    controller.enter(target('g2'));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ milestoneId: 'g2' }));
    expect(changed).not.toHaveBeenCalledWith(null);
  });

  it('dismisses on explicit outside and escape commands', () => {
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed);
    controller.open(target());
    controller.dismiss('outside-click');
    expect(changed).toHaveBeenLastCalledWith(null);
    controller.open(target());
    controller.dismiss('escape');
    expect(changed).toHaveBeenLastCalledWith(null);
  });

  it.each(['timeline-pan', 'timeline-zoom', 'milestone-drag', 'project-drag', 'project-resize'] as const)(
    'provides a future-safe interaction-start close command for %s',
    (reason) => {
      const changed = vi.fn();
      const controller = createMilestoneQuickCardController(changed);
      controller.open(target());
      controller.closeQuickCardOnInteractionStart(reason);
      expect(controller.isOpen()).toBe(false);
      expect(changed).toHaveBeenLastCalledWith(null);
    },
  );

  it('allows only one visible target', () => {
    const changed = vi.fn();
    const controller = createMilestoneQuickCardController(changed);
    controller.open(target('g1'));
    controller.open(target('g2'));
    expect(controller.isOpen()).toBe(true);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ milestoneId: 'g2' }));
  });
});
