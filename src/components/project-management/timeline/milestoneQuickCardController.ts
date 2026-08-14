import type { TimelineMilestone } from '@/project-management/domain';

export const MILESTONE_QUICK_CARD_SHOW_DELAY_MS = 150;

export interface MilestoneQuickCardTarget {
  readonly anchorElement: HTMLElement;
  readonly milestoneId: string;
  readonly milestones: ReadonlyArray<Readonly<TimelineMilestone>>;
}

export type MilestoneQuickCardDismissReason =
  | 'escape'
  | 'outside-click'
  | 'scroll'
  | 'data-change'
  | 'dispose';

export type MilestoneQuickCardInteractionStart =
  | 'timeline-pan'
  | 'timeline-zoom'
  | 'milestone-drag'
  | 'project-drag'
  | 'project-resize';

export interface MilestoneQuickCardController {
  enter(target: MilestoneQuickCardTarget): void;
  leave(milestoneId: string): void;
  open(target: MilestoneQuickCardTarget): void;
  dismiss(reason: MilestoneQuickCardDismissReason): void;
  closeQuickCardOnInteractionStart(reason: MilestoneQuickCardInteractionStart): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createMilestoneQuickCardController(
  onChange: (target: MilestoneQuickCardTarget | null) => void,
  delayMs = MILESTONE_QUICK_CARD_SHOW_DELAY_MS,
): MilestoneQuickCardController {
  let pendingTarget: MilestoneQuickCardTarget | null = null;
  let visibleTarget: MilestoneQuickCardTarget | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingTarget = null;
  };

  const open = (target: MilestoneQuickCardTarget) => {
    cancelPending();
    visibleTarget = target;
    onChange(target);
  };

  const dismiss = (_reason: MilestoneQuickCardDismissReason) => {
    cancelPending();
    if (visibleTarget === null) return;
    visibleTarget = null;
    onChange(null);
  };

  return {
    enter(target) {
      if (visibleTarget !== null) {
        open(target);
        return;
      }
      cancelPending();
      pendingTarget = target;
      timer = setTimeout(() => {
        const nextTarget = pendingTarget;
        timer = null;
        pendingTarget = null;
        if (nextTarget) open(nextTarget);
      }, delayMs);
    },
    leave(milestoneId) {
      if (pendingTarget?.milestoneId === milestoneId) cancelPending();
    },
    open,
    dismiss,
    closeQuickCardOnInteractionStart(_reason) {
      cancelPending();
      if (visibleTarget === null) return;
      visibleTarget = null;
      onChange(null);
    },
    isOpen: () => visibleTarget !== null,
    dispose() {
      dismiss('dispose');
    },
  };
}
