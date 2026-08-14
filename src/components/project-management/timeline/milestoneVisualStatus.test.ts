import { describe, expect, it } from 'vitest';

import type { MilestoneStatus } from '@/project-management/domain';
import {
  getMilestoneStatusStyle,
  getMilestoneVisualStatus,
  milestoneStatusStyleToCssVariables,
} from './milestoneVisualStatus';

describe('Milestone visual status resolver', () => {
  it.each([
    ['unknown', 'unknown'],
    ['not_started', 'not_started'],
    ['in_progress', 'in_progress'],
    ['at_risk', 'current_focus'],
    ['completed', 'completed'],
    ['delayed', 'delayed'],
    ['blocked', 'blocked'],
    ['paused', 'paused'],
  ] as const)('maps %s to %s without changing Domain status', (domainStatus, visualStatus) => {
    expect(getMilestoneVisualStatus(domainStatus)).toBe(visualStatus);
  });

  it('uses not-started presentation for a missing status', () => {
    expect(getMilestoneVisualStatus(undefined)).toBe('unknown');
    expect(getMilestoneStatusStyle('unknown')).toMatchObject({
      fill: 'var(--milestone-status-not-started-fill)', opacity: 0.7,
    });
  });

  it.each([
    ['not_started', 'not-started', 1],
    ['current_focus', 'current-focus', 1],
    ['completed', 'completed', 1],
    ['delayed', 'delayed', 1],
    ['blocked', 'blocked', 1],
    ['paused', 'paused', 0.65],
  ] as const)('resolves %s through scoped semantic variables', (status, token, opacity) => {
    const style = getMilestoneStatusStyle(status);
    const variables = milestoneStatusStyleToCssVariables(style);
    expect(style.fill).toContain(`--milestone-status-${token}-fill`);
    expect(style.border).toContain(`--milestone-status-${token}-border`);
    expect(variables['--milestone-status-opacity']).toBe(opacity);
  });

  it('accepts every Domain status in one presentation adapter', () => {
    const statuses: readonly MilestoneStatus[] = [
      'unknown', 'not_started', 'in_progress', 'completed',
      'at_risk', 'delayed', 'blocked', 'paused',
    ];
    expect(statuses.map(getMilestoneVisualStatus)).toHaveLength(statuses.length);
  });
});
