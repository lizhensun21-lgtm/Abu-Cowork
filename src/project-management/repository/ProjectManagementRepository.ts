import type { ProjectGraph } from '../domain/types';

export interface ProjectManagementRepository {
  load(): Promise<ProjectGraph | null>;
  save(graph: ProjectGraph): Promise<void>;
  /** Optional non-fatal warning, for example when a backup was loaded read-only. */
  getLoadWarning?(): string | null;
}
