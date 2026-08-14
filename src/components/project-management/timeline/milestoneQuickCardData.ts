import type { Project, TimelineMilestone } from '@/project-management/domain';

export interface MilestoneQuickCardMetrics {
  readonly deliverableCompletionRate: number | null;
  readonly openIssueCount: number | null;
}

export interface MilestoneQuickCardData {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly projectName: string | null;
  readonly plannedDate: string;
  readonly status: TimelineMilestone['status'];
  readonly deliverableCompletionRate: number | null;
  readonly openIssueCount: number | null;
}

function validCompletion(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function validIssueCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function selectMilestoneQuickCardData(
  milestone: Readonly<TimelineMilestone>,
  projects: ReadonlyArray<Readonly<Project>>,
  metrics?: Readonly<MilestoneQuickCardMetrics>,
): MilestoneQuickCardData {
  return {
    id: milestone.id,
    code: milestone.stageGate?.trim() || null,
    name: milestone.name.trim(),
    projectName: projects.find((project) => project.id === milestone.projectId)?.name.trim() || null,
    plannedDate: milestone.date,
    status: milestone.status,
    deliverableCompletionRate: validCompletion(metrics?.deliverableCompletionRate),
    openIssueCount: validIssueCount(metrics?.openIssueCount),
  };
}

export function selectMilestoneQuickCardCluster(
  milestones: ReadonlyArray<Readonly<TimelineMilestone>>,
  projects: ReadonlyArray<Readonly<Project>>,
  metricsByMilestoneId?: ReadonlyMap<string, Readonly<MilestoneQuickCardMetrics>>,
): ReadonlyArray<MilestoneQuickCardData> {
  return milestones.map((milestone) => selectMilestoneQuickCardData(
    milestone,
    projects,
    metricsByMilestoneId?.get(milestone.id),
  ));
}
