import type { CreateMilestoneCommand, CreateProjectCommand, MoveMilestoneCommand } from '@/project-management/application';
import type { ProjectGraph, TimelineLane } from '@/project-management/domain';
import {
  buildMeetingSession,
  meetingProjectId,
  meetingTimelineId,
  validateMeetingSnapshot,
  type MeetingSnapshot,
} from './meetingSnapshot';

export interface MeetingMaintenanceState {
  readonly original: MeetingSnapshot;
  readonly working: MeetingSnapshot;
  readonly dirty: boolean;
}

function clone<T>(value: T): T { return structuredClone(value); }
function key(prefix: string) { return `${prefix}-${globalThis.crypto.randomUUID()}`; }

export function createMeetingMaintenanceState(snapshot: MeetingSnapshot): MeetingMaintenanceState {
  return { original: clone(snapshot), working: clone(snapshot), dirty: false };
}

function validated(original: MeetingSnapshot, candidate: MeetingSnapshot): MeetingMaintenanceState {
  const result = validateMeetingSnapshot(candidate);
  if (!result.snapshot) throw new Error(result.errors.map((issue) => issue.message).join('; '));
  return { original, working: result.snapshot, dirty: JSON.stringify(original) !== JSON.stringify(result.snapshot) };
}

export function addMeetingProject(state: MeetingMaintenanceState, command: CreateProjectCommand): MeetingMaintenanceState {
  const projectKey = key('project');
  const candidate = clone(state.working);
  candidate.projects.push({ project_key: projectKey, project_name: command.name, project_manager: '', status: command.projectStatus === 'closed' ? 'completed' : command.projectStatus === 'cancelled' ? 'paused' : command.projectStatus, project_code: command.projectCode, project_status: command.projectStatus, priority: '', model_id: '', note: command.description ?? '' });
  const requestedMilestoneLanes = new Set(
    (command.initialMilestones ?? []).map((milestone) => milestone.lane),
  );
  const lanes: TimelineLane[] = [
    'YD',
    ...(['OEM', 'Tier1'] as const).filter((lane) => requestedMilestoneLanes.has(lane)),
  ];
  const timelineByLane = new Map<string, string>();
  for (const lane of lanes) {
    const timelineKey = `${projectKey}-${lane}`;
    timelineByLane.set(lane, timelineKey);
    candidate.timelines.push({ timeline_key: timelineKey, project_key: projectKey, lane, timeline_name: lane === 'YD' ? command.name : `${command.name} ${lane}`, start_date: command.startDate, end_date: command.endDate, key_resources: [], date_source: 'maintenance' });
  }
  for (const milestone of command.initialMilestones ?? []) {
    const timelineKey = timelineByLane.get(milestone.lane);
    if (!timelineKey) throw new Error(`Initial ${milestone.lane} Timeline does not exist`);
    candidate.milestones.push({ milestone_key: key('milestone'), project_key: projectKey, timeline_key: timelineKey, lane: milestone.lane, milestone_name: milestone.title, milestone_date: milestone.date, stage_gate: milestone.lane === 'YD' ? milestone.code : '', status: milestone.status, note: milestone.note ?? '', is_august_2026: milestone.date.startsWith('2026-08-'), source_file: '', source_sheet: '', source_row: '' });
  }
  return validated(state.original, candidate);
}

export function addMeetingMilestone(state: MeetingMaintenanceState, command: CreateMilestoneCommand): MeetingMaintenanceState {
  const timelineKey = decodeMeetingId(command.timelineId, 'timeline');
  const timeline = state.working.timelines.find((item) => item.timeline_key === timelineKey);
  if (!timeline || meetingProjectId(timeline.project_key) !== command.projectId) throw new Error('Milestone Project/Timeline relationship is invalid');
  const candidate = clone(state.working);
  candidate.milestones.push({ milestone_key: key('milestone'), project_key: timeline.project_key, timeline_key: timeline.timeline_key, lane: timeline.lane, milestone_name: command.title, milestone_date: command.date, stage_gate: timeline.lane === 'YD' ? command.code : '', status: command.status, note: command.note ?? '', is_august_2026: command.date.startsWith('2026-08-'), source_file: '', source_sheet: '', source_row: '' });
  return validated(state.original, candidate);
}

function decodeMeetingId(value: string, kind: 'project' | 'timeline' | 'milestone') {
  const prefix = `meeting-${kind}-`;
  if (!value.startsWith(prefix)) throw new Error(`Invalid Meeting ${kind} ID`);
  return decodeURIComponent(value.slice(prefix.length));
}

export function moveMeetingMilestone(state: MeetingMaintenanceState, command: MoveMilestoneCommand): MeetingMaintenanceState {
  const milestoneKey = decodeMeetingId(command.milestoneId, 'milestone');
  const candidate = clone(state.working);
  const milestone = candidate.milestones.find((item) => item.milestone_key === milestoneKey);
  if (!milestone || meetingTimelineId(milestone.timeline_key) !== command.timelineId || meetingProjectId(milestone.project_key) !== command.projectId) throw new Error('Milestone no longer matches the Meeting snapshot');
  if (milestone.milestone_date !== command.expectedDate) throw new Error('Milestone date changed before maintenance update');
  milestone.milestone_date = command.date;
  milestone.is_august_2026 = command.date.startsWith('2026-08-');
  return validated(state.original, candidate);
}

export function meetingMaintenanceGraph(state: MeetingMaintenanceState): ProjectGraph {
  return buildMeetingSession(state.working).graph;
}

export function discardMeetingChanges(state: MeetingMaintenanceState): MeetingMaintenanceState {
  return createMeetingMaintenanceState(state.original);
}

export function prepareMeetingExport(state: MeetingMaintenanceState, status: 'draft' | 'final', now = new Date()) {
  const snapshot = clone(state.working);
  snapshot.snapshotVersion = (state.original.snapshotVersion ?? 0) + 1;
  snapshot.updatedAt = now.toISOString();
  snapshot.meeting.status = status;
  const validation = validateMeetingSnapshot(snapshot);
  if (!validation.snapshot) throw new Error(validation.errors.map((issue) => issue.message).join('; '));
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  const suffix = status === 'final' ? '_FINAL' : '';
  return {
    snapshot: validation.snapshot,
    fileName: `abu-meeting-${snapshot.meeting.month}_v${String(snapshot.snapshotVersion).padStart(3, '0')}_${stamp}${suffix}.json`,
    contents: `${JSON.stringify(validation.snapshot, null, 2)}\n`,
  };
}

export function meetingGraphIdentity(graph: Readonly<ProjectGraph>) {
  return {
    projects: graph.projects.map((item) => item.id),
    timelines: graph.projectTimelines.map((item) => item.id),
    milestones: graph.milestones.map((item) => item.id),
  };
}
