import type { MeetingSnapshot } from './meetingSnapshot';

export function meetingSnapshotFixture(month = '2026-08'): MeetingSnapshot {
  const project = (key: string) => ({ project_key: key, project_name: key, project_manager: '', status: 'active' as const, priority: '', model_id: '', note: '' });
  const timeline = (key: string, projectKey: string, lane: 'YD' | 'Tier1' = 'YD', start = '2026-01-01', end = '2026-12-31') => ({ timeline_key: key, project_key: projectKey, lane, timeline_name: key, start_date: start, end_date: end, key_resources: [], date_source: 'fixture' });
  const milestone = (key: string, projectKey: string, timelineKey: string, lane: 'YD' | 'Tier1', date: string) => ({ milestone_key: key, project_key: projectKey, timeline_key: timelineKey, lane, milestone_name: key, milestone_date: date, stage_gate: '' as const, note: '', is_august_2026: date.startsWith('2026-08-'), source_file: '', source_sheet: '', source_row: '' });
  return {
    version: 1, snapshotVersion: 1, updatedAt: '2026-08-02T00:00:00.000Z', meeting: { title: 'Review', month },
    projects: ['A', 'B', 'C', 'D'].map(project),
    timelines: [timeline('A-YD', 'A'), timeline('B-YD', 'B'), timeline('C-YD', 'C', 'YD', '2026-01-01', '2026-07-31'), timeline('C-T1', 'C', 'Tier1'), timeline('D-YD', 'D', 'YD', '2026-09-01', '2027-01-01')],
    milestones: [milestone('A-M', 'A', 'A-YD', 'YD', '2026-08-01'), milestone('B-M', 'B', 'B-YD', 'YD', '2026-07-31'), milestone('C-M', 'C', 'C-YD', 'YD', '2026-08-15'), milestone('D-M', 'D', 'D-YD', 'YD', '2026-08-31')],
  };
}
