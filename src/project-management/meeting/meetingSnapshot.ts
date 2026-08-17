import {
  MILESTONE_CODES,
  MILESTONE_STATUSES,
  PROJECT_STATUSES,
  TIMELINE_LANES,
  isCanonicalDomainDate,
  normalizeProjectGraph,
  validateProjectGraph,
  type MilestoneCode,
  type MilestoneStatus,
  type ProjectGraph,
  type ProjectStatus,
  type TimelineLane,
} from '@/project-management/domain';

export const MEETING_SNAPSHOT_VERSION = 1 as const;
export const MEETING_FILTERS = ['report-month', 'all'] as const;
export type MeetingFilter = (typeof MEETING_FILTERS)[number];

export interface MeetingSnapshotProject {
  project_key: string;
  project_name: string;
  project_manager: string;
  status: 'planning' | 'active' | 'paused' | 'completed';
  project_code?: string;
  project_status?: ProjectStatus;
  lifecycle_phase?: 'concept' | 'development' | 'validation' | 'production' | 'maintenance';
  priority: string;
  model_id: string;
  note: string;
}

export interface MeetingSnapshotTimeline {
  timeline_key: string;
  project_key: string;
  lane: TimelineLane;
  timeline_name: string;
  start_date: string;
  end_date: string;
  key_resources: string[];
  date_source: string;
}

export interface MeetingSnapshotMilestone {
  milestone_key: string;
  project_key: string;
  timeline_key: string;
  lane: TimelineLane;
  milestone_name: string;
  milestone_date: string;
  stage_gate: MilestoneCode | '';
  status?: MilestoneStatus;
  note: string;
  is_august_2026: boolean;
  source_file: string;
  source_sheet: string;
  source_row: string;
}

export interface MeetingSnapshot {
  version: typeof MEETING_SNAPSHOT_VERSION;
  snapshotVersion?: number;
  updatedAt: string;
  meeting: { title: string; month: string; status?: 'draft' | 'final' };
  projects: MeetingSnapshotProject[];
  timelines: MeetingSnapshotTimeline[];
  milestones: MeetingSnapshotMilestone[];
}

export interface MeetingValidationIssue { code: string; path: string; message: string }
export interface MeetingValidationResult {
  snapshot: MeetingSnapshot | null;
  errors: MeetingValidationIssue[];
  warnings: MeetingValidationIssue[];
}
export interface MeetingSession {
  snapshot: MeetingSnapshot;
  graph: ProjectGraph;
  reportMonth: string;
  warnings: MeetingValidationIssue[];
}

export class MeetingSnapshotValidationError extends Error {
  readonly issues: readonly MeetingValidationIssue[];

  constructor(issues: readonly MeetingValidationIssue[]) {
    super(issues.map((issue) => `[${issue.code}] ${issue.path}`).join('; '));
    this.name = 'MeetingSnapshotValidationError';
    this.issues = issues;
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const LEGACY_PROJECT_STATUSES = new Set(['planning', 'active', 'paused', 'completed']);
const LANES = new Set<string>(TIMELINE_LANES);
const CODES = new Set<string>(MILESTONE_CODES);
const STATUSES = new Set<string>(MILESTONE_STATUSES);
const FORMAL_PROJECT_STATUSES = new Set<string>(PROJECT_STATUSES);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T { return structuredClone(value); }

function requiredText(value: unknown, path: string, errors: MeetingValidationIssue[]) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push({ code: 'required-string', path, message: `${path} must be a non-empty string` });
    return '';
  }
  return value.trim();
}

function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function unique(values: string[], path: string, errors: MeetingValidationIssue[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (value && seen.has(value)) errors.push({ code: `duplicate-${path}-key`, path, message: `Duplicate ${path} key: ${value}` });
    seen.add(value);
  }
}

export function isMeetingMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value);
}

export function meetingMonthRange(month: string) {
  if (!isMeetingMonth(month)) throw new Error('reportMonth must use YYYY-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { startDate: `${month}-01`, endDate: end, nextMonthStart: next };
}

export function validateMeetingSnapshot(input: unknown): MeetingValidationResult {
  const errors: MeetingValidationIssue[] = [];
  const warnings: MeetingValidationIssue[] = [];
  if (!record(input)) return { snapshot: null, errors: [{ code: 'invalid-root', path: '', message: 'Meeting snapshot root must be an object' }], warnings };
  if (input.version !== 1) errors.push({ code: 'unsupported-version', path: 'version', message: `Unsupported Meeting snapshot version: ${String(input.version)}` });
  if (input.snapshotVersion !== undefined && (!Number.isInteger(input.snapshotVersion) || Number(input.snapshotVersion) < 1)) errors.push({ code: 'invalid-snapshot-version', path: 'snapshotVersion', message: 'snapshotVersion must be a positive integer' });
  if (typeof input.updatedAt !== 'string' || Number.isNaN(Date.parse(input.updatedAt))) errors.push({ code: 'invalid-updated-at', path: 'updatedAt', message: 'updatedAt must be a valid timestamp' });

  const meetingInput = record(input.meeting) ? input.meeting : {};
  if (!record(input.meeting)) errors.push({ code: 'invalid-meeting', path: 'meeting', message: 'meeting must be an object' });
  const title = requiredText(meetingInput.title, 'meeting.title', errors);
  const month = requiredText(meetingInput.month, 'meeting.month', errors);
  if (!isMeetingMonth(month)) errors.push({ code: 'invalid-meeting-month', path: 'meeting.month', message: 'meeting.month must use YYYY-MM' });
  const meetingStatus = meetingInput.status;
  if (meetingStatus !== undefined && meetingStatus !== 'draft' && meetingStatus !== 'final') errors.push({ code: 'invalid-meeting-status', path: 'meeting.status', message: 'meeting.status must be draft or final' });

  const projects: MeetingSnapshotProject[] = [];
  if (!Array.isArray(input.projects)) errors.push({ code: 'invalid-projects', path: 'projects', message: 'projects must be an array' });
  else input.projects.forEach((item, index) => {
    const path = `projects[${index}]`;
    if (!record(item)) { errors.push({ code: 'invalid-project', path, message: 'Project must be an object' }); return; }
    const status = item.status;
    if (!LEGACY_PROJECT_STATUSES.has(String(status))) errors.push({ code: 'invalid-project-status', path: `${path}.status`, message: 'status is invalid' });
    if (item.project_status !== undefined && !FORMAL_PROJECT_STATUSES.has(String(item.project_status))) errors.push({ code: 'invalid-formal-project-status', path: `${path}.project_status`, message: 'project_status is invalid' });
    projects.push({
      project_key: requiredText(item.project_key, `${path}.project_key`, errors),
      project_name: requiredText(item.project_name, `${path}.project_name`, errors),
      project_manager: text(item.project_manager),
      status: LEGACY_PROJECT_STATUSES.has(String(status)) ? status as MeetingSnapshotProject['status'] : 'planning',
      ...(typeof item.project_code === 'string' ? { project_code: item.project_code } : {}),
      ...(FORMAL_PROJECT_STATUSES.has(String(item.project_status)) ? { project_status: item.project_status as ProjectStatus } : {}),
      ...(typeof item.lifecycle_phase === 'string' ? { lifecycle_phase: item.lifecycle_phase as MeetingSnapshotProject['lifecycle_phase'] } : {}),
      priority: text(item.priority), model_id: text(item.model_id), note: text(item.note),
    });
  });

  const timelines: MeetingSnapshotTimeline[] = [];
  if (!Array.isArray(input.timelines)) errors.push({ code: 'invalid-timelines', path: 'timelines', message: 'timelines must be an array' });
  else input.timelines.forEach((item, index) => {
    const path = `timelines[${index}]`;
    if (!record(item)) { errors.push({ code: 'invalid-timeline', path, message: 'Timeline must be an object' }); return; }
    const start = requiredText(item.start_date, `${path}.start_date`, errors);
    const end = requiredText(item.end_date, `${path}.end_date`, errors);
    if (!isCanonicalDomainDate(start) || !isCanonicalDomainDate(end) || start > end) errors.push({ code: 'invalid-date-range', path, message: 'Timeline date range is invalid' });
    if (!LANES.has(String(item.lane))) errors.push({ code: 'invalid-lane', path: `${path}.lane`, message: 'lane must be YD, Tier1, or OEM' });
    if (!Array.isArray(item.key_resources) || item.key_resources.some((entry) => typeof entry !== 'string')) errors.push({ code: 'invalid-key-resources', path: `${path}.key_resources`, message: 'key_resources must be a string array' });
    timelines.push({ timeline_key: requiredText(item.timeline_key, `${path}.timeline_key`, errors), project_key: requiredText(item.project_key, `${path}.project_key`, errors), lane: LANES.has(String(item.lane)) ? item.lane as TimelineLane : 'YD', timeline_name: requiredText(item.timeline_name, `${path}.timeline_name`, errors), start_date: start, end_date: end, key_resources: Array.isArray(item.key_resources) ? item.key_resources.filter((entry): entry is string => typeof entry === 'string') : [], date_source: text(item.date_source) });
  });

  const milestones: MeetingSnapshotMilestone[] = [];
  if (!Array.isArray(input.milestones)) errors.push({ code: 'invalid-milestones', path: 'milestones', message: 'milestones must be an array' });
  else input.milestones.forEach((item, index) => {
    const path = `milestones[${index}]`;
    if (!record(item)) { errors.push({ code: 'invalid-milestone', path, message: 'Milestone must be an object' }); return; }
    const date = requiredText(item.milestone_date, `${path}.milestone_date`, errors);
    if (!isCanonicalDomainDate(date)) errors.push({ code: 'invalid-date', path: `${path}.milestone_date`, message: 'Milestone date is invalid' });
    if (!LANES.has(String(item.lane))) errors.push({ code: 'invalid-lane', path: `${path}.lane`, message: 'lane is invalid' });
    if (item.stage_gate !== '' && !CODES.has(String(item.stage_gate))) errors.push({ code: 'invalid-stage-gate', path: `${path}.stage_gate`, message: 'stage_gate is invalid' });
    if (item.status !== undefined && !STATUSES.has(String(item.status))) errors.push({ code: 'invalid-milestone-status', path: `${path}.status`, message: 'Milestone status is invalid' });
    milestones.push({ milestone_key: requiredText(item.milestone_key, `${path}.milestone_key`, errors), project_key: requiredText(item.project_key, `${path}.project_key`, errors), timeline_key: requiredText(item.timeline_key, `${path}.timeline_key`, errors), lane: LANES.has(String(item.lane)) ? item.lane as TimelineLane : 'YD', milestone_name: requiredText(item.milestone_name, `${path}.milestone_name`, errors), milestone_date: date, stage_gate: CODES.has(String(item.stage_gate)) ? item.stage_gate as MilestoneCode : '', ...(STATUSES.has(String(item.status)) ? { status: item.status as MilestoneStatus } : {}), note: text(item.note), is_august_2026: item.is_august_2026 === true, source_file: text(item.source_file), source_sheet: text(item.source_sheet), source_row: text(item.source_row) });
  });

  unique(projects.map((item) => item.project_key), 'project', errors);
  unique(timelines.map((item) => item.timeline_key), 'timeline', errors);
  unique(milestones.map((item) => item.milestone_key), 'milestone', errors);
  const projectKeys = new Set(projects.map((item) => item.project_key));
  const timelineByKey = new Map(timelines.map((item) => [item.timeline_key, item]));
  for (const timeline of timelines) if (!projectKeys.has(timeline.project_key)) errors.push({ code: 'orphan-timeline', path: timeline.timeline_key, message: `Timeline references missing Project: ${timeline.project_key}` });
  for (const project of projects) {
    const lanes = timelines.filter((item) => item.project_key === project.project_key);
    if (lanes.filter((item) => item.lane === 'YD').length !== 1) errors.push({ code: 'invalid-yd-count', path: project.project_key, message: `Project ${project.project_key} must have exactly one YD Timeline` });
    if (new Set(lanes.map((item) => item.lane)).size !== lanes.length) errors.push({ code: 'duplicate-project-lane', path: project.project_key, message: `Project ${project.project_key} has duplicate Timeline lanes` });
  }
  for (const milestone of milestones) {
    const timeline = timelineByKey.get(milestone.timeline_key);
    if (!timeline) errors.push({ code: 'orphan-milestone', path: milestone.milestone_key, message: `Milestone references missing Timeline: ${milestone.timeline_key}` });
    else if (timeline.project_key !== milestone.project_key || timeline.lane !== milestone.lane) errors.push({ code: 'broken-relation', path: milestone.milestone_key, message: `Milestone ${milestone.milestone_key} relation is inconsistent` });
  }
  if (projects.length === 0) warnings.push({ code: 'empty-projects', path: 'projects', message: 'Meeting snapshot contains no Projects' });
  if (errors.length) return { snapshot: null, errors, warnings };
  return { snapshot: { version: 1, ...(typeof input.snapshotVersion === 'number' ? { snapshotVersion: input.snapshotVersion } : {}), updatedAt: input.updatedAt as string, meeting: { title, month, ...(meetingStatus === 'draft' || meetingStatus === 'final' ? { status: meetingStatus } : {}) }, projects, timelines, milestones }, errors, warnings };
}

function stableId(kind: string, key: string) { return `meeting-${kind}-${encodeURIComponent(key)}`; }
export const meetingProjectId = (key: string) => stableId('project', key);
export const meetingTimelineId = (key: string) => stableId('timeline', key);
export const meetingMilestoneId = (key: string) => stableId('milestone', key);

export function projectMeetingSnapshot(snapshot: MeetingSnapshot): ProjectGraph {
  const validation = validateMeetingSnapshot(snapshot);
  if (!validation.snapshot) throw new Error(validation.errors.map((issue) => issue.message).join('; '));
  const source = validation.snapshot;
  const timelines = source.timelines.map((item) => ({ id: meetingTimelineId(item.timeline_key), projectId: meetingProjectId(item.project_key), lane: item.lane, name: item.timeline_name, startDate: item.start_date, endDate: item.end_date, keyResources: [...item.key_resources] }));
  const graph = normalizeProjectGraph({
    projects: source.projects.map((item) => {
      const yd = source.timelines.find((timeline) => timeline.project_key === item.project_key && timeline.lane === 'YD')!;
      return { id: meetingProjectId(item.project_key), name: item.project_name, startDate: yd.start_date, endDate: yd.end_date, projectStatus: item.project_status ?? (item.status === 'completed' ? 'closed' : item.status), ...(item.project_code?.trim() ? { projectCode: item.project_code } : {}), ...(item.lifecycle_phase ? { lifecyclePhase: item.lifecycle_phase } : {}), note: item.note, priority: item.priority };
    }),
    projectTimelines: timelines,
    milestones: source.milestones.map((item) => ({ id: meetingMilestoneId(item.milestone_key), projectId: meetingProjectId(item.project_key), timelineId: meetingTimelineId(item.timeline_key), lane: item.lane, title: item.milestone_name, date: item.milestone_date, code: item.lane === 'YD' ? item.stage_gate : '', ...(item.status ? { status: item.status } : {}), note: item.note })),
    persons: [], projectMemberships: [],
    projectTeams: source.projects.filter((item) => item.project_manager.trim()).map((item) => ({ projectId: meetingProjectId(item.project_key), externalProjectManager: item.project_manager.trim() })),
  });
  const graphValidation = validateProjectGraph(graph);
  if (!graphValidation.valid) throw new Error(graphValidation.issues[0].message);
  return graph;
}

export function filterMeetingGraph(graph: Readonly<ProjectGraph>, reportMonth: string, filter: MeetingFilter): ProjectGraph {
  if (filter === 'all') return graph as ProjectGraph;
  const { startDate, nextMonthStart } = meetingMonthRange(reportMonth);
  const timelines = new Map(graph.projectTimelines.map((item) => [item.id, item]));
  const included = new Set<string>();
  for (const milestone of graph.milestones) {
    const timeline = timelines.get(milestone.timelineId);
    if (timeline && timeline.startDate < nextMonthStart && timeline.endDate >= startDate && milestone.date >= startDate && milestone.date < nextMonthStart) included.add(timeline.projectId);
  }
  const timelineIds = new Set(graph.projectTimelines.filter((item) => included.has(item.projectId)).map((item) => item.id));
  return { projects: graph.projects.filter((item) => included.has(item.id)), projectTimelines: graph.projectTimelines.filter((item) => timelineIds.has(item.id)), milestones: graph.milestones.filter((item) => timelineIds.has(item.timelineId)), persons: graph.persons, projectMemberships: graph.projectMemberships.filter((item) => included.has(item.projectId)), projectTeams: graph.projectTeams.filter((item) => included.has(item.projectId)) };
}

export function buildMeetingSession(input: unknown): MeetingSession {
  const validation = validateMeetingSnapshot(input);
  if (!validation.snapshot) throw new MeetingSnapshotValidationError(validation.errors);
  return { snapshot: clone(validation.snapshot), graph: projectMeetingSnapshot(validation.snapshot), reportMonth: validation.snapshot.meeting.month, warnings: validation.warnings };
}
