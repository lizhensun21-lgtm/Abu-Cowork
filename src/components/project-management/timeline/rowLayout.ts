import type { ProjectListRow } from '@/project-management/application';
import type { TimelineRow } from '@/project-management/timeline';

export const PROJECT_LIST_COLUMN_WIDTH = 320;
export const TIMELINE_HEADER_HEIGHT = 48;
export const PROJECT_SUMMARY_ROW_HEIGHT = 64;
export const TIMELINE_LANE_ROW_HEIGHT = 48;

export type ProjectManagementLayoutRow =
  | Readonly<{ kind: 'project'; key: string; height: number; project: ProjectListRow }>
  | Readonly<{ kind: 'timeline'; key: string; height: number; timeline: TimelineRow }>;

export function createProjectManagementLayoutRows(
  projects: readonly ProjectListRow[],
  timelines: readonly TimelineRow[],
): readonly ProjectManagementLayoutRow[] {
  const timelinesByProjectId = new Map<string, TimelineRow[]>();
  for (const timeline of timelines) {
    const projectTimelines = timelinesByProjectId.get(timeline.projectId) ?? [];
    projectTimelines.push(timeline);
    timelinesByProjectId.set(timeline.projectId, projectTimelines);
  }

  const rows: ProjectManagementLayoutRow[] = [];
  for (const project of projects) {
    rows.push(Object.freeze({
      kind: 'project', key: `project:${project.projectId}`,
      height: PROJECT_SUMMARY_ROW_HEIGHT, project,
    }));
    for (const timeline of timelinesByProjectId.get(project.projectId) ?? []) {
      rows.push(Object.freeze({
        kind: 'timeline', key: `timeline:${timeline.rowKey}`,
        height: TIMELINE_LANE_ROW_HEIGHT, timeline,
      }));
    }
  }
  return Object.freeze(rows);
}
