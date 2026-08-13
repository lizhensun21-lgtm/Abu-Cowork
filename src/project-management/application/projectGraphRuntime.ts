import {
  createEmptyProjectGraph,
  normalizeProjectGraph,
  validateProjectGraph,
  type ProjectGraphValidationIssue,
} from '../domain/projectGraph';
import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from '../repository/ProjectManagementRepository';

export type ProjectGraphMutation = (draft: ProjectGraph) => ProjectGraph;

export class ProjectGraphValidationError extends Error {
  readonly issues: readonly ProjectGraphValidationIssue[];

  constructor(issues: readonly ProjectGraphValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'ProjectGraphValidationError';
    this.issues = issues;
  }
}

function freezeGraph(graph: ProjectGraph): ProjectGraph {
  for (const project of graph.projects) Object.freeze(project);
  for (const timeline of graph.projectTimelines) {
    Object.freeze(timeline.keyResources);
    Object.freeze(timeline);
  }
  for (const milestone of graph.milestones) Object.freeze(milestone);
  for (const person of graph.persons) Object.freeze(person);
  for (const membership of graph.projectMemberships) {
    Object.freeze(membership.roles);
    Object.freeze(membership);
  }
  for (const team of graph.projectTeams) Object.freeze(team);
  Object.freeze(graph.projects);
  Object.freeze(graph.projectTimelines);
  Object.freeze(graph.milestones);
  Object.freeze(graph.persons);
  Object.freeze(graph.projectMemberships);
  Object.freeze(graph.projectTeams);
  return Object.freeze(graph);
}

function prepareGraph(candidate: ProjectGraph): ProjectGraph {
  const normalized = normalizeProjectGraph(candidate);
  const validation = validateProjectGraph(normalized);
  if (!validation.valid) throw new ProjectGraphValidationError(validation.issues);
  return normalized;
}

export function createInitialProjectGraph(): ProjectGraph {
  return freezeGraph(prepareGraph(createEmptyProjectGraph()));
}

export async function loadProjectGraph(
  repository: ProjectManagementRepository,
): Promise<ProjectGraph> {
  const loaded = await repository.load();
  return freezeGraph(prepareGraph(loaded ?? createEmptyProjectGraph()));
}

/** Save-first transaction boundary. The current graph is untouched on failure. */
export async function commitProjectGraphMutation(
  repository: ProjectManagementRepository,
  currentGraph: ProjectGraph,
  mutation: ProjectGraphMutation,
): Promise<ProjectGraph> {
  const draft = structuredClone(currentGraph);
  const candidate = prepareGraph(mutation(draft));
  await repository.save(candidate);
  return freezeGraph(candidate);
}
