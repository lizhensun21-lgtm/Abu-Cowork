import type { MilestoneCode, MilestoneStatus, ProjectGraph } from '../domain/types';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export interface MoveMilestoneCommand {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly expectedDate: string;
  readonly date: string;
}

export interface UpdateMilestoneCommand {
  readonly milestoneId: string;
  readonly projectId: string;
  readonly timelineId: string;
  readonly expected: Readonly<{
    title: string;
    date: string;
    code: MilestoneCode | '';
    status?: MilestoneStatus;
    note?: string;
  }>;
  readonly values: Readonly<{
    title: string;
    date: string;
    code: MilestoneCode | '';
    status?: MilestoneStatus;
    note?: string;
  }>;
}

export class MilestoneMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MilestoneMutationConflictError';
  }
}

function resolveMilestone(
  draft: ProjectGraph,
  identity: Pick<MoveMilestoneCommand, 'milestoneId' | 'projectId' | 'timelineId'>,
) {
  const milestone = draft.milestones.find((item) => item.id === identity.milestoneId);
  if (!milestone) {
    throw new MilestoneMutationConflictError(`Milestone no longer exists: ${identity.milestoneId}`);
  }
  if (milestone.projectId !== identity.projectId || milestone.timelineId !== identity.timelineId) {
    throw new MilestoneMutationConflictError(
      `Milestone relationship changed before commit: ${identity.milestoneId}`,
    );
  }
  return milestone;
}

/** Creates a narrow mutation; normalization and validation remain runtime concerns. */
export function moveMilestone(command: MoveMilestoneCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    const milestone = resolveMilestone(draft, command);
    if (milestone.date !== command.expectedDate) {
      throw new MilestoneMutationConflictError(
        `Milestone date changed before commit: ${command.milestoneId}`,
      );
    }

    milestone.date = command.date;
    return draft;
  };
}

/** Updates editable Milestone fields while preserving the I5 date mutation contract. */
export function updateMilestone(command: UpdateMilestoneCommand): ProjectGraphMutation {
  return (draft) => {
    const milestone = resolveMilestone(draft, command);
    const expected = command.expected;
    if (
      milestone.title !== expected.title
      || milestone.date !== expected.date
      || milestone.code !== expected.code
      || milestone.status !== expected.status
      || milestone.note !== expected.note
    ) {
      throw new MilestoneMutationConflictError(`Milestone changed before commit: ${command.milestoneId}`);
    }
    milestone.title = command.values.title;
    milestone.code = command.values.code;
    milestone.status = command.values.status;
    milestone.note = command.values.note;
    if (command.values.date !== milestone.date) {
      return moveMilestone({
        milestoneId: command.milestoneId,
        projectId: command.projectId,
        timelineId: command.timelineId,
        expectedDate: milestone.date,
        date: command.values.date,
      })(draft);
    }
    return draft;
  };
}
