import type { ProjectGraph } from '../domain/types';

export interface ProjectManagementRepository {
  load(): Promise<ProjectGraph | null>;
  save(graph: ProjectGraph): Promise<void>;
}
