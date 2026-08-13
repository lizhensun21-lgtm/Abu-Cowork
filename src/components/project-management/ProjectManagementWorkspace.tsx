import { useEffect } from 'react';
import { FolderKanban, LoaderCircle, TriangleAlert } from 'lucide-react';

import { useI18n } from '@/i18n';
import {
  initializeProjectManagement,
  useProjectManagementStore,
} from '@/project-management/state';

export default function ProjectManagementWorkspace() {
  const { t } = useI18n();
  const initializationStatus = useProjectManagementStore(
    (state) => state.initializationStatus,
  );
  const projectCount = useProjectManagementStore(
    (state) => state.graph.projects.length,
  );
  const initializationError = useProjectManagementStore((state) => state.error);

  useEffect(() => {
    void initializeProjectManagement().catch(() => {
      // The runtime store exposes the failure through its error selector.
    });
  }, []);

  const retryInitialization = () => {
    void initializeProjectManagement().catch(() => {
      // Keep the rendered error state as the single user-facing failure path.
    });
  };

  const isInitializing = initializationStatus === 'uninitialized'
    || initializationStatus === 'initializing';

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
        {isInitializing ? (
          <div className="flex items-center gap-2 text-body text-[var(--abu-text-muted)]" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.projectManagement.initializing}</span>
          </div>
        ) : initializationStatus === 'error' ? (
          <div className="flex flex-col items-center gap-2" role="alert">
            <div className="flex items-center gap-2 text-body text-[var(--abu-danger)]">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              <span>{t.projectManagement.initializationError}</span>
            </div>
            {initializationError ? (
              <p className="max-w-sm text-minor text-[var(--abu-text-muted)]">
                {initializationError}
              </p>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-[var(--abu-border)] bg-[var(--abu-bg-canvas)] px-3 py-1.5 text-body text-[var(--abu-text-primary)] transition-colors hover:bg-[var(--abu-bg-hover)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]"
              onClick={retryInitialization}
            >
              {t.common.retry}
            </button>
          </div>
        ) : projectCount === 0 ? (
          <p className="text-body text-[var(--abu-text-muted)]">
            {t.projectManagement.empty}
          </p>
        ) : null}
      </div>
    </section>
  );
}
