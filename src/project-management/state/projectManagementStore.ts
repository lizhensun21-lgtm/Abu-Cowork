import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  commitProjectGraphMutation,
  createInitialProjectGraph,
  loadProjectGraph,
  type ProjectGraphMutation,
} from '../application/projectGraphRuntime';
import {
  moveMilestone,
  updateMilestone,
  type MoveMilestoneCommand,
  type UpdateMilestoneCommand,
} from '../application/milestoneCommands';
import { updateProject, type UpdateProjectCommand } from '../application/projectCommands';
import {
  addProjectMember, changeProjectMemberRoles, removeProjectMember, setProjectManager,
  type AddProjectMemberCommand, type ChangeProjectMemberRolesCommand,
  type RemoveProjectMemberCommand, type SetProjectManagerCommand,
} from '../application/teamCommands';
import {
  moveProjectTimeline,
  resizeProjectTimeline,
  updateProjectTimeline,
  type MoveProjectTimelineCommand,
  type ResizeProjectTimelineCommand,
  type UpdateProjectTimelineCommand,
} from '../application/timelineCommands';
import type { ProjectGraph } from '../domain/types';
import {
  createPerson, deletePerson, updatePerson,
  type CreatePersonCommand, type DeletePersonCommand, type UpdatePersonCommand,
} from '../application/personCommands';
import {
  createMilestone, createProject, createProjectTimeline,
  deleteMilestone, deleteProject, deleteProjectTimeline,
  type CreateMilestoneCommand, type CreateProjectCommand,
  type CreateProjectTimelineCommand, type DeleteMilestoneCommand,
  type DeleteProjectCommand, type DeleteProjectTimelineCommand,
} from '../application/crudCommands';
import { JsonProjectManagementRepository } from '../repository/JsonProjectManagementRepository';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';

export type ProjectManagementInitializationStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'error';

export interface ProjectManagementState {
  readonly graph: ProjectGraph;
  readonly initializationStatus: ProjectManagementInitializationStatus;
  readonly error: string | null;
}

export interface ProjectManagementStore {
  getState(): ProjectManagementState;
  initialize(): Promise<void>;
  commitGraph(mutation: ProjectGraphMutation): Promise<void>;
  useStore<T>(selector: (state: ProjectManagementState) => T): T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createProjectManagementStore(
  repository: ProjectManagementRepository,
): ProjectManagementStore {
  const store = createStore<ProjectManagementState>()(() => ({
    graph: createInitialProjectGraph(),
    initializationStatus: 'uninitialized',
    error: null,
  }));
  let initialization: Promise<void> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();

  const initialize = () => {
    if (store.getState().initializationStatus === 'ready') return Promise.resolve();
    if (initialization) return initialization;

    store.setState({ initializationStatus: 'initializing', error: null });
    initialization = loadProjectGraph(repository)
      .then((graph) => {
        store.setState({
          graph,
          initializationStatus: 'ready',
          error: repository.getLoadWarning?.() ?? null,
        });
      })
      .catch((error: unknown) => {
        store.setState({ initializationStatus: 'error', error: errorMessage(error) });
        throw error;
      })
      .finally(() => {
        initialization = null;
      });
    return initialization;
  };

  const commitGraph = (mutation: ProjectGraphMutation) => {
    const run = async () => {
      if (store.getState().initializationStatus !== 'ready') {
        throw new Error('Project Management runtime must be initialized before mutation');
      }
      try {
        const graph = await commitProjectGraphMutation(
          repository,
          store.getState().graph,
          mutation,
        );
        store.setState({ graph, error: null });
      } catch (error: unknown) {
        store.setState({ error: errorMessage(error) });
        throw error;
      }
    };
    const result = mutationQueue.then(run, run);
    mutationQueue = result.catch(() => undefined);
    return result;
  };

  return {
    getState: store.getState,
    initialize,
    commitGraph,
    useStore: <T>(selector: (state: ProjectManagementState) => T) => (
      useStore(store, selector)
    ),
  };
}

const runtimeStore = createProjectManagementStore(
  new JsonProjectManagementRepository(),
);

export const initializeProjectManagement = runtimeStore.initialize;
export const commitProjectManagementGraph = runtimeStore.commitGraph;
export const moveProjectManagementMilestone = (command: MoveMilestoneCommand) => (
  runtimeStore.commitGraph(moveMilestone(command))
);
export const moveProjectManagementTimeline = (command: MoveProjectTimelineCommand) => (
  runtimeStore.commitGraph(moveProjectTimeline(command))
);
export const resizeProjectManagementTimeline = (command: ResizeProjectTimelineCommand) => (
  runtimeStore.commitGraph(resizeProjectTimeline(command))
);
export const updateProjectManagementProject = (command: UpdateProjectCommand) => (
  runtimeStore.commitGraph(updateProject(command))
);
export const updateProjectManagementTimeline = (command: UpdateProjectTimelineCommand) => (
  runtimeStore.commitGraph(updateProjectTimeline(command))
);
export const updateProjectManagementMilestone = (command: UpdateMilestoneCommand) => (
  runtimeStore.commitGraph(updateMilestone(command))
);
export const createProjectManagementProject = (command: CreateProjectCommand) => (
  runtimeStore.commitGraph(createProject(command))
);
export const createProjectManagementTimeline = (command: CreateProjectTimelineCommand) => (
  runtimeStore.commitGraph(createProjectTimeline(command))
);
export const createProjectManagementMilestone = (command: CreateMilestoneCommand) => (
  runtimeStore.commitGraph(createMilestone(command))
);
export const deleteProjectManagementProject = (command: DeleteProjectCommand) => (
  runtimeStore.commitGraph(deleteProject(command))
);
export const deleteProjectManagementTimeline = (command: DeleteProjectTimelineCommand) => (
  runtimeStore.commitGraph(deleteProjectTimeline(command))
);
export const deleteProjectManagementMilestone = (command: DeleteMilestoneCommand) => (
  runtimeStore.commitGraph(deleteMilestone(command))
);
export const createProjectManagementPerson = (command: CreatePersonCommand) => (
  runtimeStore.commitGraph(createPerson(command))
);
export const updateProjectManagementPerson = (command: UpdatePersonCommand) => (
  runtimeStore.commitGraph(updatePerson(command))
);
export const deleteProjectManagementPerson = (command: DeletePersonCommand) => (
  runtimeStore.commitGraph(deletePerson(command))
);
export const addProjectManagementMember = (command: AddProjectMemberCommand) => (
  runtimeStore.commitGraph(addProjectMember(command))
);
export const removeProjectManagementMember = (command: RemoveProjectMemberCommand) => (
  runtimeStore.commitGraph(removeProjectMember(command))
);
export const changeProjectManagementMemberRoles = (command: ChangeProjectMemberRolesCommand) => (
  runtimeStore.commitGraph(changeProjectMemberRoles(command))
);
export const setProjectManagementManager = (command: SetProjectManagerCommand) => (
  runtimeStore.commitGraph(setProjectManager(command))
);

export function useProjectManagementStore<T>(
  selector: (state: ProjectManagementState) => T,
): T {
  return runtimeStore.useStore(selector);
}
