import { useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
  Video,
  type LucideProps,
} from 'lucide-react';

import DefaultUserAvatar from '@/components/common/DefaultUserAvatar';
import ProjectManagementWorkspace from '@/components/project-management/ProjectManagementWorkspace';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePortalUserAdapter } from './PortalUserAdapter';

export type ProjectManagementPortalView =
  | 'overview'
  | 'meetings'
  | 'calendar'
  | 'ledger'
  | 'resources'
  | 'members';

export const DEFAULT_PROJECT_MANAGEMENT_PORTAL_VIEW: ProjectManagementPortalView = 'overview';

type PortalNavigationItem = {
  view: ProjectManagementPortalView;
  icon: ComponentType<LucideProps>;
  label: string;
};

function PortalPlaceholder({ title, message }: { title: string; message: string }) {
  return (
    <section className="flex h-full items-center justify-center px-8 text-center">
      <div className="max-w-sm">
        <h1 className="text-title font-semibold text-[var(--abu-text-primary)]">{title}</h1>
        <p className="mt-2 text-body text-[var(--abu-text-muted)]">{message}</p>
      </div>
    </section>
  );
}

export default function ProjectManagementPortal() {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<ProjectManagementPortalView>(
    DEFAULT_PROJECT_MANAGEMENT_PORTAL_VIEW,
  );
  const setViewMode = useSettingsStore((state) => state.setViewMode);
  const { user, openAccountSettings } = usePortalUserAdapter();

  const navigation: PortalNavigationItem[] = [
    { view: 'overview', icon: LayoutDashboard, label: t.projectManagementPortal.overview },
    { view: 'meetings', icon: Video, label: t.projectManagementPortal.meetings },
    { view: 'calendar', icon: CalendarDays, label: t.projectManagementPortal.calendar },
    { view: 'ledger', icon: BookOpenText, label: t.projectManagementPortal.ledger },
    { view: 'resources', icon: FolderKanban, label: t.projectManagementPortal.resources },
    { view: 'members', icon: Users, label: t.projectManagementPortal.members },
  ];
  const activeItem = navigation.find((item) => item.view === activeView) ?? navigation[0];

  return (
    <div
      data-project-management-portal
      data-electron-no-drag
      className="flex min-h-0 w-full flex-1 overflow-hidden bg-[var(--abu-bg-canvas)]"
    >
      <aside
        data-project-management-portal-sidebar
        className="flex w-[232px] shrink-0 flex-col border-r border-[var(--abu-border)] bg-[var(--abu-bg-canvas)] px-3 py-3"
        aria-label={t.projectManagementPortal.navigationLabel}
      >
        <button
          type="button"
          onClick={() => openAccountSettings()}
          className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--abu-bg-hover)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]"
          title={t.projectManagementPortal.openAccountSettings}
        >
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--abu-border)]">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <DefaultUserAvatar />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-body font-medium text-[var(--abu-text-primary)]">
            {user.displayName}
          </span>
          <Settings className="h-4 w-4 text-[var(--abu-text-tertiary)] group-hover:text-[var(--abu-text-secondary)]" aria-hidden="true" />
        </button>

        <div className="mt-4 px-2">
          <p className="text-caption font-medium uppercase tracking-[0.08em] text-[var(--abu-text-muted)]">
            {t.projectManagementPortal.moduleName}
          </p>
        </div>

        <nav className="mt-2 space-y-1" aria-label={t.projectManagementPortal.navigationLabel}>
          {navigation.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              type="button"
              aria-current={activeView === view ? 'page' : undefined}
              onClick={() => setActiveView(view)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]',
                activeView === view
                  ? 'bg-[var(--abu-bg-hover)] font-medium text-[var(--abu-text-primary)]'
                  : 'text-[var(--abu-text-secondary)] hover:bg-[var(--abu-bg-hover)] hover:text-[var(--abu-text-primary)] active:bg-[var(--abu-bg-active)]',
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px]',
                  activeView === view ? 'text-[var(--abu-clay)]' : 'text-[var(--abu-text-tertiary)]',
                )}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setViewMode('chat')}
          className="mt-auto flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body text-[var(--abu-text-secondary)] transition-colors hover:bg-[var(--abu-bg-hover)] hover:text-[var(--abu-text-primary)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]"
        >
          <ArrowLeft className="h-[18px] w-[18px] text-[var(--abu-text-tertiary)]" strokeWidth={1.75} aria-hidden="true" />
          <span>{t.projectManagementPortal.backToAbu}</span>
        </button>
      </aside>

      <main
        data-project-management-portal-content
        className="m-2 min-w-0 flex-1 overflow-hidden rounded-[var(--abu-radius-panel)] border border-[var(--abu-border)] bg-[var(--abu-bg-base)] shadow-[var(--abu-shadow-card)]"
      >
        {activeView === 'overview' ? (
          <ProjectManagementWorkspace />
        ) : (
          <PortalPlaceholder title={activeItem.label} message={t.projectManagementPortal.notAvailable} />
        )}
      </main>
    </div>
  );
}
