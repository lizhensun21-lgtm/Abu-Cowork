import type { ProjectGraph } from '../domain/types';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export interface MoveMilestoneCommand {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly expectedDate: string;
  readonly date: string;
}

export class MilestoneMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MilestoneMutationConflictError';
  }
}

/** Creates a narrow mutation; normalization and validation remain runtime concerns. */
export function moveMilestone(command: MoveMilestoneCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    const milestone = draft.milestones.find((item) => item.id === command.milestoneId);
    if (!milestone) {
      throw new MilestoneMutationConflictError(`Milestone no longer exists: ${command.milestoneId}`);
    }
    if (
      milestone.projectId !== command.projectId
      || milestone.timelineId !== command.timelineId
    ) {
      throw new MilestoneMutationConflictError(
        `Milestone relationship changed before commit: ${command.milestoneId}`,
      );
    }
    if (milestone.date !== command.expectedDate) {
      throw new MilestoneMutationConflictError(
        `Milestone date changed before commit: ${command.milestoneId}`,
      );
    }

    milestone.date = command.date;
    return draft;
  };
}
