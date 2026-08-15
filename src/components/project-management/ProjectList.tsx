import { Box, ChevronRight, MoreHorizontal, UserRound } from 'lucide-react';

import type { ProjectOverviewDisplayRow } from './projectOverviewAdapter';

function ProjectMilestoneIndicators({ completed, total }: {
  completed?: number;
  total?: number;
}) {
  const hasMilestones = total !== undefined && total > 0;
  const completionRate = hasMilestones ? Math.round(((completed ?? 0) / total) * 100) : 0;
  const progressLabel = hasMilestones
    ? `${completed ?? 0} / ${total} milestones completed`
    : 'No milestone data';

  return (
    <span className="project-status-indicators">
      <span
        className="project-status-ring project-status-ring--progress"
        role="img"
        aria-label={progressLabel}
        title={progressLabel}
      >
        {hasMilestones ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5.3" fill="none" stroke="var(--po-border)" strokeWidth="1.5" />
            <circle
              cx="7"
              cy="7"
              r="5.3"
              fill="none"
              pathLength="100"
              stroke="var(--po-purple)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={`${completionRate} 100`}
              transform="rotate(-90 7 7)"
            />
          </svg>
        ) : <span className="project-status-ring__empty" />}
      </span>
      <span
        className="project-status-ring project-status-ring--plan"
        role="img"
        aria-label="Milestone plan status unavailable"
        title="Milestone plan status unavailable"
      />
    </span>
  );
}

export function ProjectListRow({
  row,
  expanded,
  hovered,
  onToggleExpanded,
  onHoverTimeline,
  onOpenProject,
  onOpenTimeline,
}: {
  row: ProjectOverviewDisplayRow;
  expanded: boolean;
  hovered: boolean;
  onToggleExpanded: (projectId: string) => void;
  onHoverTimeline: (timelineId: string | null) => void;
  onOpenProject: (projectId: string) => void;
  onOpenTimeline: (timelineId: string) => void;
}) {
  const { project, timeline } = row;
  const summary = project.milestoneSummary;
  const label = row.isProjectPrimaryRow ? project.projectName : timeline.label;

  return (
    <div
      data-testid={`project-list-row-${timeline.timelineId}`}
      data-project-id={project.projectId}
      data-timeline-id={timeline.timelineId}
      data-row-depth={row.depth}
      className={`project-label-cell ${row.isProjectPrimaryRow
        ? 'project-label-cell--parent'
        : 'project-label-cell--child'}${hovered ? ' is-project-hovered' : ''}`}
      onPointerEnter={() => onHoverTimeline(timeline.timelineId)}
      onPointerLeave={() => onHoverTimeline(null)}
    >
      <div className="project-label-identity">
        {row.isProjectPrimaryRow ? (
          <button
            type="button"
            className="project-label-button project-label-button--main"
            data-no-timeline-pan
            onClick={() => onOpenProject(project.projectId)}
          >
            <Box size={16} className="project-icon project-icon--parent" aria-hidden="true" />
            <span className="project-label-text" title={label}>{label}</span>
          </button>
        ) : (
          <button
            type="button"
            className="project-label-button project-label-button--child"
            data-no-timeline-pan
            onClick={() => onOpenTimeline(timeline.timelineId)}
          >
            <span className="tree-branch" aria-hidden="true" />
            <Box size={15} className="project-icon" aria-hidden="true" />
            <span className="project-label-text" title={label}>{label}</span>
          </button>
        )}
      </div>
      <div className="project-label-meta">
        {row.isProjectPrimaryRow && row.hasChildTimelines ? (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => onToggleExpanded(project.projectId)}
            aria-label={expanded ? 'Collapse project timelines' : 'Expand project timelines'}
            aria-expanded={expanded}
          >
            <ChevronRight size={16} className={expanded ? 'expanded' : ''} />
          </button>
        ) : row.isProjectPrimaryRow ? <span className="project-toggle-spacer" /> : null}
        <ProjectMilestoneIndicators
          completed={summary?.completed}
          total={summary?.total}
        />
        <button
          type="button"
          className="icon-button project-row-more"
          aria-label={`${label} more actions unavailable`}
          title="Read-only view"
          disabled
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
        <span
          data-testid={`project-manager-${project.projectId}`}
          className={`member-chip member-chip--readonly${project.projectManagerName ? '' : ' member-chip--unassigned'}`}
          title={project.projectManagerName ?? '—'}
          aria-label={project.projectManagerName ?? 'No project manager'}
        >
          {project.projectManagerName
            ? project.projectManagerName.trim().slice(0, 1).toUpperCase()
            : <UserRound size={12} aria-hidden="true" />}
        </span>
      </div>
    </div>
  );
}
