import type { ProjectStatus } from '@/project-management/domain';
import { useI18n } from '@/i18n';
import type { ProjectManagementLayoutRow } from './timeline/rowLayout';

const MISSING_VALUE = '—';

function display(value: string | undefined): string {
  return value?.trim() || MISSING_VALUE;
}

export function ProjectListRow({ row }: { row: ProjectManagementLayoutRow }) {
  const { t } = useI18n();
  const statusLabels: Record<ProjectStatus, string> = {
    planning: t.projectManagement.statusPlanning,
    active: t.projectManagement.statusActive,
    paused: t.projectManagement.statusPaused,
    closed: t.projectManagement.statusClosed,
    cancelled: t.projectManagement.statusCancelled,
  };

  if (row.kind === 'timeline') {
    return (
      <div data-testid={`project-list-layout-row-${row.key}`} data-row-kind="timeline" className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-[var(--abu-border-subtle)] bg-[var(--abu-bg-base)] px-4 text-minor text-[var(--abu-text-secondary)]" style={{ height: row.height }}>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--abu-clay-50)]" aria-hidden="true" />
        <span className="w-10 font-medium">{row.timeline.lane}</span>
        <span className="min-w-0 truncate text-[var(--abu-text-muted)]" title={row.timeline.label}>{row.timeline.label}</span>
      </div>
    );
  }

  const project = row.project;
  return (
    <div data-testid={`project-list-row-${project.projectId}`} data-row-kind="project" className="sticky left-0 z-10 flex flex-col justify-center border-b border-r border-[var(--abu-border-subtle)] bg-[var(--abu-bg-canvas)] px-4 text-[var(--abu-text-primary)]" style={{ height: row.height }}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span data-testid={`project-code-${project.projectId}`} className="shrink-0 font-mono text-caption text-[var(--abu-text-muted)]">{display(project.projectCode)}</span>
        <strong className="min-w-0 truncate text-body font-semibold" title={project.projectName}>{display(project.projectName)}</strong>
        <span className="ml-auto shrink-0 text-caption text-[var(--abu-text-secondary)]">{statusLabels[project.projectStatus]}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 overflow-hidden whitespace-nowrap text-caption text-[var(--abu-text-muted)]">
        <span>{display(project.startDate)} – {display(project.endDate)}</span>
        <span aria-hidden="true">·</span>
        <span data-testid={`project-manager-${project.projectId}`} className="truncate">{display(project.projectManagerName)}</span>
        <span aria-hidden="true">·</span>
        <span data-testid={`project-milestones-${project.projectId}`} className="shrink-0">{project.milestoneSummary
          ? t.projectManagement.milestoneProgress.replace('{completed}', String(project.milestoneSummary.completed)).replace('{total}', String(project.milestoneSummary.total))
          : MISSING_VALUE}</span>
      </div>
    </div>
  );
}
