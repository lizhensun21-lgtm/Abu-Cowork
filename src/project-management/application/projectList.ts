import type {
  ProjectGraph,
  ProjectStatus,
} from '../domain/types';
import { selectProjectOrder } from './projectOrder';
import { resolveProjectManager } from './teamPresentation';

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

  const projectsById = new Map(graph.projects.map((project) => [project.id, project]));
  return Object.freeze(selectProjectOrder(graph).flatMap((projectId) => {
    const project = projectsById.get(projectId);
    if (!project) return [];
    const summary = milestonesByProjectId.get(project.id);
    return [Object.freeze({
      projectId: project.id,
      ...(project.projectCode ? { projectCode: project.projectCode } : {}),
      projectName: project.name,
      projectStatus: project.projectStatus,
      startDate: project.startDate,
      endDate: project.endDate,
      ...(resolveProjectManager(graph, project.id)
        ? { projectManagerName: resolveProjectManager(graph, project.id)?.person.name }
        : {}),
      ...(summary
        ? { milestoneSummary: Object.freeze({ ...summary }) }
        : {}),
    })];
  }));
}
