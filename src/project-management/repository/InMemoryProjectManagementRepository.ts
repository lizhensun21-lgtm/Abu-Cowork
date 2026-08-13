import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from './ProjectManagementRepository';

function cloneGraph(graph: ProjectGraph): ProjectGraph {
  return structuredClone(graph);
}

export class InMemoryProjectManagementRepository
implements ProjectManagementRepository {
  private graph: ProjectGraph | null;

  constructor(initialGraph: ProjectGraph | null = null) {
    this.graph = initialGraph === null ? null : cloneGraph(initialGraph);
  }

  async load(): Promise<ProjectGraph | null> {
    return this.graph === null ? null : cloneGraph(this.graph);
  }

  async save(graph: ProjectGraph): Promise<void> {
    this.graph = cloneGraph(graph);
  }
}
