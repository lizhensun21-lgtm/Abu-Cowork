import { useEffect, useMemo } from 'react';
import { FolderKanban, LoaderCircle, TriangleAlert } from 'lucide-react';

import { useI18n } from '@/i18n';
import {
  initializeProjectManagement,
  useProjectManagementStore,
} from '@/project-management/state';
import { TimelineRenderer } from './timeline/TimelineRenderer';

export default function ProjectManagementWorkspace() {
  const { t } = useI18n();
  const initializationStatus = useProjectManagementStore(
    (state) => state.initializationStatus,
  );
  const projectGraph = useProjectManagementStore((state) => state.graph);
  const initializationError = useProjectManagementStore((state) => state.error);
  const projectCount = useMemo(() => projectGraph.projects.length, [projectGraph]);

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
      className="flex h-full min-h-0 flex-col bg-[var(--abu-bg-base)]"
      aria-labelledby="project-management-title"
    >
      <header className="flex shrink-0 items-center gap-3 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--abu-border)] bg-[var(--abu-bg-canvas)] text-[var(--abu-clay)]">
          <FolderKanban className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <h1 id="project-management-title" className="text-title font-semibold text-[var(--abu-text-primary)]">
            {t.sidebar.projectManagement}
          </h1>
          {initializationStatus === 'ready' && projectCount > 0 ? (
            <p className="text-minor text-[var(--abu-text-muted)]">
              {t.projectManagement.projectCount.replace('{count}', String(projectCount))}
            </p>
          ) : null}
        </div>
      </header>
      {isInitializing ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-body text-[var(--abu-text-muted)]" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.projectManagement.initializing}</span>
          </div>
        </div>
      ) : initializationStatus === 'error' ? (
        <div className="flex flex-1 items-center justify-center px-8 pb-8 text-center">
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
        </div>
      ) : projectCount === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 pb-8 text-center">
          <p className="text-body text-[var(--abu-text-muted)]">
            {t.projectManagement.empty}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-6 pb-6">
          <TimelineRenderer graph={projectGraph} />
        </div>
      )}
    </section>
  );
}
