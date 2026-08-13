import { describe, expect, it } from 'vitest';
import { createEmptyProjectGraph } from '../domain/projectGraph';
import { InMemoryProjectManagementRepository } from './InMemoryProjectManagementRepository';

describe('InMemoryProjectManagementRepository', () => {
  it('starts without persisted data', async () => {
    const repository = new InMemoryProjectManagementRepository();
    await expect(repository.load()).resolves.toBeNull();
  });

  it('keeps repository state separate from caller-owned graph objects', async () => {
    const repository = new InMemoryProjectManagementRepository();
    const graph = createEmptyProjectGraph();
    await repository.save(graph);

    graph.persons.push({ id: 'outside', name: 'Outside mutation' });
    const firstLoad = await repository.load();
    expect(firstLoad?.persons).toEqual([]);

    firstLoad?.persons.push({ id: 'loaded', name: 'Loaded mutation' });
    await expect(repository.load()).resolves.toEqual(createEmptyProjectGraph());
  });
});
