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
  moveProjectTimeline,
  resizeProjectTimeline,
  updateProjectTimeline,
  type MoveProjectTimelineCommand,
  type ResizeProjectTimelineCommand,
  type UpdateProjectTimelineCommand,
} from '../application/timelineCommands';
import type { ProjectGraph } from '../domain/types';
import { InMemoryProjectManagementRepository } from '../repository/InMemoryProjectManagementRepository';
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
        store.setState({ graph, initializationStatus: 'ready', error: null });
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
  new InMemoryProjectManagementRepository(),
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

export function useProjectManagementStore<T>(
  selector: (state: ProjectManagementState) => T,
): T {
  return runtimeStore.useStore(selector);
}
