import type {
  ProjectGraph,
  ProjectStatus,
} from '../domain/types';

export interface ProjectListMilestoneSummary {
  readonly completed: number;
  readonly total: number;
}

export interface ProjectListRow {
  readonly projectId: string;
  readonly projectCode?: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly projectManagerName?: string;
  readonly milestoneSummary?: ProjectListMilestoneSummary;
}

/**
 * Read-only Project List projection. ProjectGraph order is the canonical row order.
 * Every value comes from a current PM entity relationship; no compatibility fallback
 * or date-derived status is introduced here.
 */
export function selectProjectListRows(
  graph: Readonly<ProjectGraph>,
): readonly ProjectListRow[] {
  const personsById = new Map(graph.persons.map((person) => [person.id, person]));
  const managersByProjectId = new Map<string, string>();
  for (const membership of graph.projectMemberships) {
    if (
      membership.status === 'active'
      && membership.roles.includes('project_manager')
      && !managersByProjectId.has(membership.projectId)
    ) {
      const person = personsById.get(membership.personId);
      if (person) managersByProjectId.set(membership.projectId, person.name);
    }
  }

  const timelinesById = new Map(
    graph.projectTimelines.map((timeline) => [timeline.id, timeline]),
  );
  const milestonesByProjectId = new Map<string, { completed: number; total: number }>();
  for (const milestone of graph.milestones) {
    const timeline = timelinesById.get(milestone.timelineId);
    if (
      !timeline
      || timeline.projectId !== milestone.projectId
      || timeline.lane !== milestone.lane
    ) {
      continue;
    }
    const summary = milestonesByProjectId.get(milestone.projectId)
      ?? { completed: 0, total: 0 };
    summary.total += 1;
    if (milestone.status === 'completed') summary.completed += 1;
    milestonesByProjectId.set(milestone.projectId, summary);
  }

  return Object.freeze(graph.projects.map((project) => {
    const summary = milestonesByProjectId.get(project.id);
    return Object.freeze({
      projectId: project.id,
      ...(project.projectCode ? { projectCode: project.projectCode } : {}),
      projectName: project.name,
      projectStatus: project.projectStatus,
      startDate: project.startDate,
      endDate: project.endDate,
      ...(managersByProjectId.has(project.id)
        ? { projectManagerName: managersByProjectId.get(project.id) }
        : {}),
      ...(summary
        ? { milestoneSummary: Object.freeze({ ...summary }) }
        : {}),
    });
  }));
}
