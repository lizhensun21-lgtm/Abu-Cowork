import { selectProjectListRows, type ProjectListRow } from '@/project-management/application';
import type { ProjectGraph } from '@/project-management/domain';
import {
  deriveTimelineRange,
  selectTimelineRows,
  selectTimelineScale,
  type TimelineRange,
  type TimelineRow,
} from '@/project-management/timeline';

export const PROJECT_OVERVIEW_PROJECT_COLUMN_WIDTH = 282;
export const PROJECT_OVERVIEW_TITLE_HEIGHT = 38;
export const PROJECT_OVERVIEW_TOOLBAR_HEIGHT = 38;
export const PROJECT_OVERVIEW_RULER_HEIGHT = 36;
export const PROJECT_OVERVIEW_ROW_HEIGHT = 64;
export const PROJECT_OVERVIEW_BOTTOM_BAR_HEIGHT = 40;
export const PROJECT_OVERVIEW_TIME_SCALE = 'week' as const;
export const PROJECT_OVERVIEW_ZOOM_DENSITY = 'month' as const;

export interface ProjectOverviewCapabilities {
  readonly canCreate: false;
  readonly canEdit: false;
  readonly canDelete: false;
  readonly canDrag: false;
  readonly canResize: false;
}

export interface ProjectOverviewProject extends ProjectListRow {
  readonly primaryTimeline: TimelineRow;
  readonly childTimelines: readonly TimelineRow[];
}

export interface ProjectOverviewDisplayRow {
  readonly key: string;
  readonly project: ProjectOverviewProject;
  readonly timeline: TimelineRow;
  readonly isProjectPrimaryRow: boolean;
  readonly hasChildTimelines: boolean;
  readonly depth: 0 | 1;
}

export interface ProjectOverviewViewModel {
  readonly projects: readonly ProjectOverviewProject[];
  readonly timelineRows: readonly TimelineRow[];
  readonly range: TimelineRange;
  readonly today: string;
  readonly timeScale: typeof PROJECT_OVERVIEW_TIME_SCALE;
  readonly pxPerDay: number;
  readonly capabilities: ProjectOverviewCapabilities;
}

const READ_ONLY_CAPABILITIES: ProjectOverviewCapabilities = Object.freeze({
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canDrag: false,
  canResize: false,
});

function fallbackRange(today: string): TimelineRange {
  return Object.freeze({
    startDate: `${today.slice(0, 4)}-01-01`,
    endDate: `${today.slice(0, 4)}-12-31`,
  });
}

export function createProjectOverviewViewModel(
  graph: Readonly<ProjectGraph>,
  today: string,
): ProjectOverviewViewModel {
  const projectRows = selectProjectListRows(graph);
  const timelineRows = selectTimelineRows(graph);
  const timelinesByProjectId = new Map<string, TimelineRow[]>();
  for (const timeline of timelineRows) {
    const projectTimelines = timelinesByProjectId.get(timeline.projectId) ?? [];
    projectTimelines.push(timeline);
    timelinesByProjectId.set(timeline.projectId, projectTimelines);
  }

  const projects = projectRows.flatMap((project): ProjectOverviewProject[] => {
    const timelines = timelinesByProjectId.get(project.projectId) ?? [];
    const primaryTimeline = timelines.find((timeline) => timeline.lane === 'YD');
    if (!primaryTimeline) return [];
    return [Object.freeze({
      ...project,
      primaryTimeline,
      childTimelines: Object.freeze(
        timelines.filter((timeline) => timeline.lane !== 'YD'),
      ),
    })];
  });

  return Object.freeze({
    projects: Object.freeze(projects),
    timelineRows,
    range: deriveTimelineRange(timelineRows, fallbackRange(today)),
    today,
    timeScale: PROJECT_OVERVIEW_TIME_SCALE,
    pxPerDay: selectTimelineScale(PROJECT_OVERVIEW_ZOOM_DENSITY).pxPerDay,
    capabilities: READ_ONLY_CAPABILITIES,
  });
}

export function createProjectOverviewDisplayRows(
  viewModel: ProjectOverviewViewModel,
  expandedProjectIds: ReadonlySet<string>,
): readonly ProjectOverviewDisplayRow[] {
  const rows: ProjectOverviewDisplayRow[] = [];
  for (const project of viewModel.projects) {
    rows.push(Object.freeze({
      key: project.primaryTimeline.rowKey,
      project,
      timeline: project.primaryTimeline,
      isProjectPrimaryRow: true,
      hasChildTimelines: project.childTimelines.length > 0,
      depth: 0,
    }));
    if (!expandedProjectIds.has(project.projectId)) continue;
    for (const timeline of project.childTimelines) {
      rows.push(Object.freeze({
        key: timeline.rowKey,
        project,
        timeline,
        isProjectPrimaryRow: false,
        hasChildTimelines: false,
        depth: 1,
      }));
    }
  }
  return Object.freeze(rows);
}
