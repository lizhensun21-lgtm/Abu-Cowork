import type { ProjectGraph } from '../domain/types';

/** Canonical Project display order shared by Project List and Timeline projections. */
export function selectProjectOrder(
  graph: Readonly<ProjectGraph>,
): readonly string[] {
  return Object.freeze(graph.projects.map((project) => project.id));
}
