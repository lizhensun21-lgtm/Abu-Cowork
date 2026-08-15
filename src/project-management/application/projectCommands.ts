import type { Project, ProjectGraph, ProjectStatus } from '../domain/types';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export interface UpdateProjectCommand {
  readonly projectId: string;
  readonly expected: Readonly<Pick<Project, 'name' | 'projectCode' | 'startDate' | 'endDate' | 'projectStatus' | 'description'>>;
  readonly values: Readonly<{
    name: string;
    projectCode?: string;
    startDate: string;
    endDate: string;
    projectStatus: ProjectStatus;
    description?: string;
  }>;
}

export class ProjectMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMutationConflictError';
  }
}

/** Atomically edits Project identity and its mandatory YD date mirror. */
export function updateProject(command: UpdateProjectCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    const project = draft.projects.find((item) => item.id === command.projectId);
    if (!project) throw new ProjectMutationConflictError(`Project no longer exists: ${command.projectId}`);
    const expected = command.expected;
    if (
      project.name !== expected.name || project.projectCode !== expected.projectCode
      || project.startDate !== expected.startDate || project.endDate !== expected.endDate
      || project.projectStatus !== expected.projectStatus || project.description !== expected.description
    ) {
      throw new ProjectMutationConflictError(`Project changed before commit: ${command.projectId}`);
    }
    const ydTimeline = draft.projectTimelines.find(
      (timeline) => timeline.projectId === project.id && timeline.lane === 'YD',
    );
    if (!ydTimeline) throw new ProjectMutationConflictError(`Project YD Timeline no longer exists: ${project.id}`);
    if (ydTimeline.startDate !== project.startDate || ydTimeline.endDate !== project.endDate) {
      throw new ProjectMutationConflictError(`Project YD Timeline changed before commit: ${project.id}`);
    }
    Object.assign(project, command.values);
    ydTimeline.startDate = command.values.startDate;
    ydTimeline.endDate = command.values.endDate;
    return draft;
  };
}
