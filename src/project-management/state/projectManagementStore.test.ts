import { describe, expect, it, vi } from 'vitest';
import { ProjectGraphValidationError } from '../application/projectGraphRuntime';
import { createEmptyProjectGraph } from '../domain/projectGraph';
import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';
import { createProjectManagementStore } from './projectManagementStore';

function makeValidGraph(name = 'Runtime Project'): ProjectGraph {
  return {
    ...createEmptyProjectGraph(),
    projects: [{
      id: 'project-1',
      name,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      projectStatus: 'active',
    }],
    projectTimelines: [{
      id: 'timeline-yd',
      projectId: 'project-1',
      lane: 'YD',
      name: 'YD Plan',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      keyResources: [],
    }],
    projectTeams: [{ projectId: 'project-1' }],
  };
}

function repositoryWith(graph: ProjectGraph | null): ProjectManagementRepository {
  return {
    load: vi.fn(async () => graph),
    save: vi.fn(async () => undefined),
  };
}

describe('Project Management runtime initialization', () => {
  it('initializes an empty graph without mock business data', async () => {
    const store = createProjectManagementStore(repositoryWith(null));
    expect(store.getState()).toMatchObject({
      graph: createEmptyProjectGraph(),
      initializationStatus: 'uninitialized',
    });

    await store.initialize();

    expect(store.getState()).toMatchObject({
      graph: createEmptyProjectGraph(),
      initializationStatus: 'ready',
      error: null,
    });
  });

  it('normalizes and loads a valid graph', async () => {
    const graph = makeValidGraph('  Normalized Project  ');
    const store = createProjectManagementStore(repositoryWith(graph));

    await store.initialize();

    expect(store.getState().graph.projects[0].name).toBe('Normalized Project');
    expect(Object.isFrozen(store.getState().graph)).toBe(true);
  });

  it('rejects invalid loaded data without contaminating the runtime graph', async () => {
    const invalid = makeValidGraph();
    invalid.projectTimelines = [];
    const store = createProjectManagementStore(repositoryWith(invalid));
    const before = store.getState().graph;

    await expect(store.initialize()).rejects.toBeInstanceOf(ProjectGraphValidationError);

    expect(store.getState().graph).toBe(before);
    expect(store.getState().initializationStatus).toBe('error');
    expect(store.getState().error).toContain('exactly one YD Timeline');
  });

  it('deduplicates concurrent and repeated successful initialization', async () => {
    const repository = repositoryWith(null);
    const store = createProjectManagementStore(repository);

    await Promise.all([store.initialize(), store.initialize()]);
    await store.initialize();

    expect(repository.load).toHaveBeenCalledTimes(1);
  });
});

describe('Project Management validated commit boundary', () => {
  it('commits a valid graph only after repository save succeeds', async () => {
    let finishSave: (() => void) | undefined;
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => null),
      save: vi.fn(() => new Promise<void>((resolve) => {
        finishSave = resolve;
      })),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();

    const commit = store.commitGraph(() => makeValidGraph('  Saved Project  '));
    await vi.waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
    expect(store.getState().graph.projects).toEqual([]);

    finishSave?.();
    await commit;
    expect(store.getState().graph.projects[0].name).toBe('Saved Project');
  });

  it('keeps the current graph when validation fails and does not save', async () => {
    const repository = repositoryWith(null);
    const store = createProjectManagementStore(repository);
    await store.initialize();
    const before = store.getState().graph;

    await expect(store.commitGraph(() => makeValidGraph('')))
      .rejects.toBeInstanceOf(ProjectGraphValidationError);

    expect(store.getState().graph).toBe(before);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('keeps the current graph when repository save fails', async () => {
    const failure = new Error('save failed');
    const repository: ProjectManagementRepository = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => { throw failure; }),
    };
    const store = createProjectManagementStore(repository);
    await store.initialize();
    const before = store.getState().graph;

    await expect(store.commitGraph(() => makeValidGraph())).rejects.toBe(failure);

    expect(store.getState().graph).toBe(before);
    expect(store.getState().error).toBe('save failed');
  });

  it('gives mutations an isolated draft instead of the runtime graph', async () => {
    const repository = repositoryWith(null);
    const store = createProjectManagementStore(repository);
    await store.initialize();
    const before = store.getState().graph;

    await store.commitGraph((draft) => {
      Object.assign(draft, makeValidGraph());
      return draft;
    });

    expect(store.getState().graph).not.toBe(before);
    expect(before.projects).toEqual([]);
    expect(store.getState().graph.projects).toHaveLength(1);
  });

  it('allows retry after initialization failure', async () => {
    const repository = repositoryWith(null);
    vi.mocked(repository.load)
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(null);
    const store = createProjectManagementStore(repository);

    await expect(store.initialize()).rejects.toThrow('load failed');
    await expect(store.initialize()).resolves.toBeUndefined();

    expect(repository.load).toHaveBeenCalledTimes(2);
    expect(store.getState().initializationStatus).toBe('ready');
    expect(store.getState().error).toBeNull();
  });

  it('does not expose a low-level setState or setGraph API', () => {
    const store = createProjectManagementStore(repositoryWith(null));
    expect(store).not.toHaveProperty('setState');
    expect(store).not.toHaveProperty('setGraph');
  });
});
