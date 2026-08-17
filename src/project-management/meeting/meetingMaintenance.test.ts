import { describe, expect, it, vi } from 'vitest';
import { createProject } from '@/project-management/application';
import {
  addMeetingMilestone,
  addMeetingProject,
  createMeetingMaintenanceState,
  moveMeetingMilestone,
  prepareMeetingExport,
} from './meetingMaintenance';
import { buildMeetingSession, meetingMilestoneId, meetingProjectId, meetingTimelineId } from './meetingSnapshot';
import { meetingSnapshotFixture } from './meetingTestFixture';

describe('Meeting maintenance isolation and export', () => {
  it('adds a Project with one YD Timeline only to the working snapshot', () => {
    const state = createMeetingMaintenanceState(meetingSnapshotFixture());
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const next = addMeetingProject(state, { name: 'Added', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' });
    expect(next.working.projects).toHaveLength(state.working.projects.length + 1);
    expect(next.original).toEqual(state.original);
    expect(next.dirty).toBe(true);
  });

  it('adds and moves Milestones without changing the original snapshot', () => {
    const state = createMeetingMaintenanceState(meetingSnapshotFixture());
    const added = addMeetingMilestone(state, { projectId: meetingProjectId('A'), timelineId: meetingTimelineId('A-YD'), title: 'Added', date: '2026-08-20', code: 'G1' });
    const moved = moveMeetingMilestone(added, { milestoneId: meetingMilestoneId('A-M'), projectId: meetingProjectId('A'), timelineId: meetingTimelineId('A-YD'), expectedDate: '2026-08-01', date: '2026-08-02' });
    expect(moved.working.milestones.find((item) => item.milestone_key === 'A-M')?.milestone_date).toBe('2026-08-02');
    expect(moved.original.milestones.find((item) => item.milestone_key === 'A-M')?.milestone_date).toBe('2026-08-01');
  });

  it('rolls back invalid mutations by throwing before returning state', () => {
    const state = createMeetingMaintenanceState(meetingSnapshotFixture());
    expect(() => moveMeetingMilestone(state, { milestoneId: meetingMilestoneId('A-M'), projectId: meetingProjectId('A'), timelineId: meetingTimelineId('A-YD'), expectedDate: 'wrong', date: '2026-08-02' })).toThrow();
    expect(state.dirty).toBe(false);
  });

  it('exports a new version and leaves both original and working inputs unchanged', () => {
    const state = createMeetingMaintenanceState(meetingSnapshotFixture());
    const before = structuredClone(state);
    const result = prepareMeetingExport(state, 'final', new Date('2026-08-17T12:34:00.000Z'));
    expect(result.snapshot.snapshotVersion).toBe(2);
    expect(result.fileName).toMatch(/v002_.*_FINAL\.json$/);
    expect(state).toEqual(before);
  });

  it('cannot affect a separate production graph', () => {
    const production = buildMeetingSession(meetingSnapshotFixture()).graph;
    const before = structuredClone(production);
    const mutation = createProject({ name: 'Production only', startDate: '2026-01-01', endDate: '2026-12-31', projectStatus: 'active' }, () => 'unused');
    expect(typeof mutation).toBe('function');
    createMeetingMaintenanceState(meetingSnapshotFixture());
    expect(production).toEqual(before);
  });
});
