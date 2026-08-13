import type { ProjectStatus } from '@/project-management/domain';
import type { ProjectListRow } from '@/project-management/application';
import { useI18n } from '@/i18n';

const MISSING_VALUE = '—';

function display(value: string | undefined): string {
  return value?.trim() || MISSING_VALUE;
}

export function ProjectList({ rows }: { rows: readonly ProjectListRow[] }) {
  const { t } = useI18n();
  const statusLabels: Record<ProjectStatus, string> = {
    planning: t.projectManagement.statusPlanning,
    active: t.projectManagement.statusActive,
    paused: t.projectManagement.statusPaused,
    closed: t.projectManagement.statusClosed,
    cancelled: t.projectManagement.statusCancelled,
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <div className="overflow-x-auto rounded-lg border border-[var(--abu-border)] bg-[var(--abu-bg-base)]">
        <table className="w-full min-w-[880px] border-collapse text-left text-body">
          <thead className="sticky top-0 z-10 bg-[var(--abu-bg-canvas)] text-minor text-[var(--abu-text-muted)]">
            <tr className="border-b border-[var(--abu-border)]">
              <th className="w-28 px-4 py-2.5 font-medium">{t.projectManagement.projectCode}</th>
              <th className="min-w-52 px-4 py-2.5 font-medium">{t.projectManagement.projectName}</th>
              <th className="w-28 px-4 py-2.5 font-medium">{t.projectManagement.projectStatus}</th>
              <th className="w-32 px-4 py-2.5 font-medium">{t.projectManagement.startDate}</th>
              <th className="w-32 px-4 py-2.5 font-medium">{t.projectManagement.endDate}</th>
              <th className="w-36 px-4 py-2.5 font-medium">{t.projectManagement.projectManager}</th>
              <th className="w-32 px-4 py-2.5 font-medium">{t.projectManagement.milestones}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.projectId}
                data-testid={`project-list-row-${row.projectId}`}
                className="border-b border-[var(--abu-border-subtle)] text-[var(--abu-text-primary)] last:border-b-0 hover:bg-[var(--abu-bg-hover)]"
              >
                <td className="px-4 py-3 font-mono text-minor text-[var(--abu-text-secondary)]">
                  {display(row.projectCode)}
                </td>
                <td className="px-4 py-3 font-medium">{display(row.projectName)}</td>
                <td className="px-4 py-3 text-[var(--abu-text-secondary)]">
                  {statusLabels[row.projectStatus]}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--abu-text-secondary)]">
                  {display(row.startDate)}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--abu-text-secondary)]">
                  {display(row.endDate)}
                </td>
                <td className="px-4 py-3 text-[var(--abu-text-secondary)]">
                  {display(row.projectManagerName)}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--abu-text-secondary)]">
                  {row.milestoneSummary
                    ? t.projectManagement.milestoneProgress
                      .replace('{completed}', String(row.milestoneSummary.completed))
                      .replace('{total}', String(row.milestoneSummary.total))
                    : MISSING_VALUE}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
