import type { MilestoneStatus } from '@/project-management/domain';

export const MILESTONE_VISUAL_STATUSES = [
  'unknown', 'not_started', 'in_progress', 'current_focus',
  'completed', 'delayed', 'blocked', 'paused',
] as const;
export type MilestoneVisualStatus = (typeof MILESTONE_VISUAL_STATUSES)[number];

export interface MilestoneStatusStyle {
  readonly fill: string;
  readonly border: string;
  readonly labelColor: string;
  readonly opacity: number;
}

export interface MilestoneStatusCssVariables {
  readonly '--milestone-status-fill': string;
  readonly '--milestone-status-stroke': string;
  readonly '--milestone-status-label': string;
  readonly '--milestone-status-opacity': number;
}

const VISUAL_STATUS_BY_DOMAIN_STATUS: Readonly<Record<MilestoneStatus, MilestoneVisualStatus>> = {
  unknown: 'unknown',
  not_started: 'not_started',
  in_progress: 'in_progress',
  completed: 'completed',
  at_risk: 'current_focus',
  delayed: 'delayed',
  blocked: 'blocked',
  paused: 'paused',
};

const STATUS_STYLES: Readonly<Record<MilestoneVisualStatus, MilestoneStatusStyle>> =
  Object.fromEntries(MILESTONE_VISUAL_STATUSES.map((status) => {
    const token = status === 'unknown' ? 'not-started' : status.replaceAll('_', '-');
    return [status, Object.freeze({
      fill: `var(--milestone-status-${token}-fill)`,
      border: `var(--milestone-status-${token}-border)`,
      labelColor: `var(--milestone-status-${token}-label)`,
      opacity: status === 'unknown' ? 0.7 : status === 'paused' ? 0.65 : 1,
    })];
  })) as unknown as Readonly<Record<MilestoneVisualStatus, MilestoneStatusStyle>>;

export function getMilestoneVisualStatus(
  status: MilestoneStatus | null | undefined,
): MilestoneVisualStatus {
  return status ? VISUAL_STATUS_BY_DOMAIN_STATUS[status] : 'unknown';
}

export function getMilestoneStatusStyle(status: MilestoneVisualStatus): MilestoneStatusStyle {
  return STATUS_STYLES[status];
}

export function milestoneStatusStyleToCssVariables(
  style: MilestoneStatusStyle,
): MilestoneStatusCssVariables {
  return {
    '--milestone-status-fill': style.fill,
    '--milestone-status-stroke': style.border,
    '--milestone-status-label': style.labelColor,
    '--milestone-status-opacity': style.opacity,
  };
}
