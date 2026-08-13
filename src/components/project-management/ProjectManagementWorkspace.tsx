import { FolderKanban } from 'lucide-react';

import { useI18n } from '@/i18n';

export default function ProjectManagementWorkspace() {
  const { t } = useI18n();

  return (
    <section
      data-project-management-workspace
      className="flex h-full min-h-0 items-center justify-center bg-[var(--abu-bg-base)] p-8"
      aria-labelledby="project-management-title"
    >
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--abu-border)] bg-[var(--abu-bg-canvas)] text-[var(--abu-clay)]">
          <FolderKanban className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h1 id="project-management-title" className="text-title font-semibold text-[var(--abu-text-primary)]">
          {t.sidebar.projectManagement}
        </h1>
      </div>
    </section>
  );
}
