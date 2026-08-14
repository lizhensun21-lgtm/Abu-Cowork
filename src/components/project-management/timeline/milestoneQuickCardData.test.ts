import { describe, expect, it } from 'vitest';

import type { Project, TimelineMilestone } from '@/project-management/domain';
import {
  selectMilestoneQuickCardCluster,
  selectMilestoneQuickCardData,
} from './milestoneQuickCardData';
import {
  formatMilestoneHeadline,
  presentMilestoneQuickCard,
} from './milestoneQuickCardPresentation';

const projects: Project[] = [{
  id: 'p1', name: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active',
}];
const milestone: TimelineMilestone = {
  id: 'g1', projectId: 'p1', timelineId: 't1', lane: 'YD', name: 'Gate', stageGate: 'G1',
  date: '2026-08-14', status: 'completed',
};

describe('milestone quick card readonly data and presentation', () => {
  it('resolves the formal project name by projectId', () => {
    expect(selectMilestoneQuickCardData(milestone, projects).projectName).toBe('Alpha');
  });

  it('retains the formal milestone date and status', () => {
    expect(selectMilestoneQuickCardData(milestone, projects)).toMatchObject({
      plannedDate: '2026-08-14', status: 'completed',
    });
  });

  it('uses null for unavailable completion and issue metrics', () => {
    expect(selectMilestoneQuickCardData(milestone, projects)).toMatchObject({
      deliverableCompletionRate: null, openIssueCount: null,
    });
  });

  it('renders unavailable metrics as an em dash', () => {
    expect(presentMilestoneQuickCard(selectMilestoneQuickCardData(milestone, projects), 'en-US'))
      .toMatchObject({ completion: '—', issues: '—' });
  });

  it('retains a real zero completion as 0%', () => {
    const data = selectMilestoneQuickCardData(milestone, projects, {
      deliverableCompletionRate: 0, openIssueCount: null,
    });
    expect(presentMilestoneQuickCard(data, 'en-US').completion).toBe('0%');
  });

  it('retains a real zero issue count as 0', () => {
    const data = selectMilestoneQuickCardData(milestone, projects, {
      deliverableCompletionRate: null, openIssueCount: 0,
    });
    expect(presentMilestoneQuickCard(data, 'en-US').issues).toBe('0');
  });

  it('rejects invalid presentation-only metrics without inventing values', () => {
    expect(selectMilestoneQuickCardData(milestone, projects, {
      deliverableCompletionRate: 101, openIssueCount: -1,
    })).toMatchObject({ deliverableCompletionRate: null, openIssueCount: null });
  });

  it('formats the planned date for presentation', () => {
    expect(presentMilestoneQuickCard(selectMilestoneQuickCardData(milestone, projects), 'en-US').plannedDate)
      .toBe('Aug 14');
  });

  it('does not duplicate a stage gate already prefixed in the name', () => {
    expect(formatMilestoneHeadline({ code: 'G1', name: 'G1 Gate' })).toBe('G1 Gate');
  });

  it('uses an em dash for a missing name and code', () => {
    expect(formatMilestoneHeadline({ code: null, name: '' })).toBe('—');
  });

  it('preserves original cluster order deterministically', () => {
    const members = [
      milestone,
      { ...milestone, id: 'g0', name: 'Earlier in source order', stageGate: 'G0' as const },
      { ...milestone, id: 'g2', name: 'Later in source order', stageGate: 'G2' as const },
    ];
    expect(selectMilestoneQuickCardCluster(members, projects).map((item) => item.id))
      .toEqual(['g1', 'g0', 'g2']);
  });

  it('returns every aggregate member exactly once', () => {
    const members = [milestone, { ...milestone, id: 'g2' }];
    expect(selectMilestoneQuickCardCluster(members, projects)).toHaveLength(2);
  });
});
