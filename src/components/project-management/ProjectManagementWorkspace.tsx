import { useEffect } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { useI18n } from '@/i18n';
import {
  addProjectManagementMember,
  changeProjectManagementMemberRoles,
  createProjectManagementMilestone,
  createProjectManagementProject,
  createProjectManagementTimeline,
  deleteProjectManagementMilestone,
  deleteProjectManagementProject,
  deleteProjectManagementTimeline,
  initializeProjectManagement,
  moveProjectManagementMilestone,
  moveProjectManagementTimeline,
  resizeProjectManagementTimeline,
  removeProjectManagementMember,
  setProjectManagementManager,
  updateProjectManagementMilestone,
  updateProjectManagementProject,
  updateProjectManagementTimeline,
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
      aria-label={t.projectManagementPortal.overview}
    >
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {initializationError ? (
            <div className="flex flex-none items-start gap-2 border-b border-[var(--abu-warning)] bg-[var(--abu-warning-bg)] px-4 py-2 text-minor text-[var(--abu-warning)]" role="alert">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              <span><strong>{t.projectManagement.persistenceWarning}.</strong> {initializationError}</span>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
          <TimelineRenderer
            graph={projectGraph}
            onMoveMilestone={moveProjectManagementMilestone}
            onMoveProjectTimeline={moveProjectManagementTimeline}
            onResizeProjectTimeline={resizeProjectManagementTimeline}
            onUpdateProject={updateProjectManagementProject}
            onUpdateProjectTimeline={updateProjectManagementTimeline}
            onUpdateMilestone={updateProjectManagementMilestone}
            onCreateProject={createProjectManagementProject}
            onCreateProjectTimeline={createProjectManagementTimeline}
            onCreateMilestone={createProjectManagementMilestone}
            onDeleteProject={deleteProjectManagementProject}
            onDeleteProjectTimeline={deleteProjectManagementTimeline}
            onDeleteMilestone={deleteProjectManagementMilestone}
            onAddMember={addProjectManagementMember}
            onRemoveMember={removeProjectManagementMember}
            onChangeMemberRoles={changeProjectManagementMemberRoles}
            onSetProjectManager={setProjectManagementManager}
          />
          </div>
        </div>
      )}
    </section>
  );
}
