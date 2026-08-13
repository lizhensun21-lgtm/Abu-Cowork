export const PROJECT_STATUSES = ['planning', 'active', 'paused', 'closed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const LIFECYCLE_PHASES = ['concept', 'development', 'validation', 'production', 'maintenance'] as const;
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export const PROJECT_TYPES = ['development', 'matching'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface Project {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  projectStatus: ProjectStatus;
  projectCode?: string;
  lifecyclePhase?: LifecyclePhase;
  note?: string;
  summary?: string;
  description?: string;
  priority?: string;
  customer?: string;
  vehicleModel?: string;
  productCategory?: string;
  productModel?: string;
  projectType?: ProjectType;
  softwarePlatform?: string;
  hardwarePlatform?: string;
  baseSoftware?: string;
  reuseProjectId?: string;
  smtSupplier?: string;
}

export const TIMELINE_LANES = ['YD', 'Tier1', 'OEM'] as const;
export type TimelineLane = (typeof TIMELINE_LANES)[number];

export interface ProjectTimeline {
  id: string;
  projectId: string;
  lane: TimelineLane;
  name: string;
  startDate: string;
  endDate: string;
  keyResources: string[];
}

export const MILESTONE_CODES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type MilestoneCode = (typeof MILESTONE_CODES)[number];

export const MILESTONE_STATUSES = [
  'unknown', 'not_started', 'in_progress', 'completed',
  'at_risk', 'delayed', 'blocked', 'paused',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface Milestone {
  id: string;
  projectId: string;
  timelineId: string;
  lane: TimelineLane;
  title: string;
  date: string;
  code: MilestoneCode | '';
  status?: MilestoneStatus;
  note?: string;
}

export interface TimelineMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly lane: TimelineLane;
  readonly name: string;
  readonly date: string;
  readonly stageGate?: MilestoneCode;
  readonly status?: MilestoneStatus;
  readonly note?: string;
}

export interface Person {
  id: string;
  name: string;
  title?: string;
}

export const PROJECT_ROLES = [
  'project_manager', 'system_owner', 'software_owner', 'hardware_owner',
  'test_owner', 'oem_contact', 'tier1_contact', 'member',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_MEMBERSHIP_STATUSES = ['active', 'inactive'] as const;
export type ProjectMembershipStatus = (typeof PROJECT_MEMBERSHIP_STATUSES)[number];

export interface ProjectMembership {
  id: string;
  projectId: string;
  personId: string;
  roles: ProjectRole[];
  status: ProjectMembershipStatus;
  joinedAt?: string;
  leftAt?: string;
}

/** Internal member and role facts live only in ProjectMembership. */
export interface ProjectTeam {
  projectId: string;
  externalProjectManager?: string;
}

/** Core graph only: no persistence metadata or later-phase collections. */
export interface ProjectGraph {
  projects: Project[];
  projectTimelines: ProjectTimeline[];
  milestones: Milestone[];
  persons: Person[];
  projectMemberships: ProjectMembership[];
  projectTeams: ProjectTeam[];
}
