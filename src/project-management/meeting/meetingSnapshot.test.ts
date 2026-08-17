import { describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '@/project-management/domain';
import {
  buildMeetingSession,
  filterMeetingGraph,
  meetingMonthRange,
  validateMeetingSnapshot,
  type MeetingSnapshot,
} from './meetingSnapshot';

function snapshot(month = '2026-08'): MeetingSnapshot {
  const project = (key: string) => ({ project_key: key, project_name: key, project_manager: '', status: 'active' as const, priority: '', model_id: '', note: '' });
  const timeline = (key: string, projectKey: string, lane: 'YD' | 'Tier1' = 'YD', start = '2026-01-01', end = '2026-12-31') => ({ timeline_key: key, project_key: projectKey, lane, timeline_name: key, start_date: start, end_date: end, key_resources: [], date_source: 'fixture' });
  const milestone = (key: string, projectKey: string, timelineKey: string, lane: 'YD' | 'Tier1', date: string) => ({ milestone_key: key, project_key: projectKey, timeline_key: timelineKey, lane, milestone_name: key, milestone_date: date, stage_gate: '' as const, note: '', is_august_2026: date.startsWith('2026-08-'), source_file: '', source_sheet: '', source_row: '' });
  return {
    version: 1, snapshotVersion: 1, updatedAt: '2026-08-02T00:00:00.000Z', meeting: { title: 'Review', month },
    projects: ['A', 'B', 'C', 'D'].map(project),
    timelines: [
      timeline('A-YD', 'A'),
      timeline('B-YD', 'B'),
      timeline('C-YD', 'C', 'YD', '2026-01-01', '2026-07-31'),
      timeline('C-T1', 'C', 'Tier1'),
      timeline('D-YD', 'D', 'YD', '2026-09-01', '2027-01-01'),
    ],
    milestones: [
      milestone('A-M', 'A', 'A-YD', 'YD', '2026-08-01'),
      milestone('B-M', 'B', 'B-YD', 'YD', '2026-07-31'),
      milestone('C-M', 'C', 'C-YD', 'YD', '2026-08-15'),
      milestone('D-M', 'D', 'D-YD', 'YD', '2026-08-31'),
    ],
  };
}

describe('Meeting snapshot and strict report-month projection', () => {
  it('keeps all projects in the all projection', () => {
    const session = buildMeetingSession(snapshot());
    expect(filterMeetingGraph(session.graph, session.reportMonth, 'all')).toBe(session.graph);
  });

  it('requires range intersection AND a milestone in month on the same Timeline', () => {
    const session = buildMeetingSession(snapshot());
    const result = filterMeetingGraph(session.graph, session.reportMonth, 'report-month');
    expect(result.projects.map((item) => item.name)).toEqual(['A']);
  });

  it('uses inclusive start and exclusive next-month boundaries', () => {
    const source = snapshot();
    source.milestones.push({ ...source.milestones[0], milestone_key: 'A-NEXT', milestone_date: '2026-09-01', is_august_2026: false });
    const result = filterMeetingGraph(buildMeetingSession(source).graph, '2026-08', 'report-month');
    expect(result.projects.map((item) => item.name)).toEqual(['A']);
  });

  it('is driven by reportMonth rather than hardcoded August and uses UTC dates', () => {
    expect(meetingMonthRange('2027-02')).toEqual({ startDate: '2027-02-01', endDate: '2027-02-28', nextMonthStart: '2027-03-01' });
    const source = snapshot('2026-07');
    expect(filterMeetingGraph(buildMeetingSession(source).graph, '2026-07', 'report-month').projects.map((item) => item.name)).toEqual(['B']);
  });

  it('rejects unsupported versions, malformed dates, and broken relations atomically', () => {
    const invalid = snapshot() as unknown as Record<string, unknown>;
    invalid.version = 2;
    (invalid.timelines as Array<Record<string, unknown>>)[0].start_date = '2026-02-30';
    (invalid.milestones as Array<Record<string, unknown>>)[0].timeline_key = 'missing';
    const result = validateMeetingSnapshot(invalid);
    expect(result.snapshot).toBeNull();
    expect(result.errors.map((item) => item.code)).toEqual(expect.arrayContaining(['unsupported-version', 'invalid-date-range', 'orphan-milestone']));
  });

  it('does not use or mutate the production graph', () => {
    const production = createEmptyProjectGraph();
    const before = structuredClone(production);
    buildMeetingSession(snapshot());
    expect(production).toEqual(before);
  });
});
