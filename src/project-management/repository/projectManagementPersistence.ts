import {
  normalizeProjectGraph,
  validateProjectGraph,
  type ProjectGraphValidationIssue,
} from '../domain/projectGraph';
import type { ProjectGraph } from '../domain/types';

export const PROJECT_MANAGEMENT_FORMAT_VERSION = 1;

export interface PersistedProjectManagementDataV1 {
  readonly formatVersion: 1;
  readonly savedAt: string;
  readonly graph: ProjectGraph;
}

export class ProjectManagementPersistenceError extends Error {
  readonly causeDetail?: unknown;

  constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'ProjectManagementPersistenceError';
    this.causeDetail = causeDetail;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertGraphShape(value: unknown): asserts value is ProjectGraph {
  if (!isRecord(value)) {
    throw new ProjectManagementPersistenceError('Project Management graph must be an object');
  }
  const collections = [
    'projects', 'projectTimelines', 'milestones', 'persons',
    'projectMemberships', 'projectTeams',
  ] as const;
  for (const collection of collections) {
    if (!Array.isArray(value[collection])) {
      throw new ProjectManagementPersistenceError(
        `Project Management graph collection "${collection}" is missing or invalid`,
      );
    }
  }
}

function validationMessage(issues: readonly ProjectGraphValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}

export function normalizeAndValidatePersistedProjectGraph(value: unknown): ProjectGraph {
  assertGraphShape(value);
  let graph: ProjectGraph;
  try {
    graph = normalizeProjectGraph(value);
  } catch (error: unknown) {
    throw new ProjectManagementPersistenceError(
      'Project Management data could not be normalized', error,
    );
  }
  const validation = validateProjectGraph(graph);
  if (!validation.valid) {
    throw new ProjectManagementPersistenceError(
      `Project Management data failed validation:\n${validationMessage(validation.issues)}`,
      validation.issues,
    );
  }
  return graph;
}

/** Single, explicit entry point for all present and future format migrations. */
export function migratePersistedProjectManagementData(value: unknown): PersistedProjectManagementDataV1 {
  if (!isRecord(value)) {
    throw new ProjectManagementPersistenceError('Project Management persistence root must be an object');
  }
  if (value.formatVersion !== PROJECT_MANAGEMENT_FORMAT_VERSION) {
    throw new ProjectManagementPersistenceError(
      `Unsupported Project Management format version: ${String(value.formatVersion)}`,
    );
  }
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) {
    throw new ProjectManagementPersistenceError('Project Management savedAt is missing or invalid');
  }
  return {
    formatVersion: PROJECT_MANAGEMENT_FORMAT_VERSION,
    savedAt: value.savedAt,
    graph: normalizeAndValidatePersistedProjectGraph(value.graph),
  };
}

export function parsePersistedProjectManagementData(content: string): PersistedProjectManagementDataV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    throw new ProjectManagementPersistenceError('Project Management data is malformed JSON', error);
  }
  return migratePersistedProjectManagementData(parsed);
}

export function serializePersistedProjectManagementData(
  graph: ProjectGraph,
  savedAt = new Date().toISOString(),
): string {
  return `${JSON.stringify({
    formatVersion: PROJECT_MANAGEMENT_FORMAT_VERSION,
    savedAt,
    graph: normalizeAndValidatePersistedProjectGraph(graph),
  }, null, 2)}\n`;
}
