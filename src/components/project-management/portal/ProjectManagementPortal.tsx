import { useEffect, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  PanelLeft,
  Settings,
  Users,
  Video,
  type LucideProps,
} from 'lucide-react';

import DefaultUserAvatar from '@/components/common/DefaultUserAvatar';
import ProjectManagementWorkspace from '@/components/project-management/ProjectManagementWorkspace';
import MeetingWorkspace from '@/components/project-management/meeting/MeetingWorkspace';
import ProjectManagementPortalModules from './ProjectManagementPortalModules';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  initializePmServerConnection,
  refreshPmServerConnection,
  usePmServerConnectionState,
} from '@/project-management/api/pmServerConnection';
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

export default function ProjectManagementPortal() {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<ProjectManagementPortalView>(
    DEFAULT_PROJECT_MANAGEMENT_PORTAL_VIEW,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const setViewMode = useSettingsStore((state) => state.setViewMode);
  const { user, openAccountSettings } = usePortalUserAdapter();
  const serverConnectionStatus = usePmServerConnectionState((state) => state.status);

  useEffect(() => {
    void initializePmServerConnection();
    const refreshOnFocus = () => {
      void refreshPmServerConnection();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, []);

  const navigation: PortalNavigationItem[] = [
    { view: 'overview', icon: LayoutDashboard, label: t.projectManagementPortal.overview },
    { view: 'meetings', icon: Video, label: t.projectManagementPortal.meetings },
    { view: 'calendar', icon: CalendarDays, label: t.projectManagementPortal.calendar },
    { view: 'ledger', icon: BookOpenText, label: t.projectManagementPortal.ledger },
    { view: 'resources', icon: FolderKanban, label: t.projectManagementPortal.resources },
    { view: 'members', icon: Users, label: t.projectManagementPortal.members },
  ];
  return (
    <div
      data-project-management-portal
      data-pm-server-connection={serverConnectionStatus}
      data-electron-no-drag
      className="flex min-h-0 w-full flex-1 overflow-hidden bg-[var(--abu-bg-canvas)]"
    >
      <aside
        data-project-management-portal-sidebar
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        className={cn(
          'flex shrink-0 flex-col border-r border-[color:rgb(17_24_39_/_0.06)] bg-[var(--abu-bg-canvas)] py-3',
          sidebarCollapsed ? 'w-[56px] px-2' : 'w-[232px] px-3',
        )}
        aria-label={t.projectManagementPortal.navigationLabel}
      >
        <div className={cn('flex items-center', sidebarCollapsed ? 'flex-col gap-2' : 'gap-1')}>
          <button
            type="button"
            aria-label={sidebarCollapsed ? t.sidebar.showSidebar : t.sidebar.hideSidebar}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--abu-text-tertiary)] transition-colors hover:bg-[var(--abu-bg-hover)] hover:text-[var(--abu-text-primary)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]"
            title={sidebarCollapsed ? t.sidebar.showSidebar : t.sidebar.hideSidebar}
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label={user.displayName}
            onClick={() => openAccountSettings()}
            className={cn(
              'group flex min-w-0 items-center rounded-lg text-left transition-colors hover:bg-[var(--abu-bg-hover)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]',
              sidebarCollapsed ? 'h-9 w-9 justify-center p-0' : 'flex-1 gap-2.5 px-2 py-2',
            )}
            title={sidebarCollapsed ? user.displayName : t.projectManagementPortal.openAccountSettings}
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[var(--abu-border)]">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <DefaultUserAvatar />
              )}
            </span>
            {!sidebarCollapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate text-body font-medium text-[var(--abu-text-primary)]">
                  {user.displayName}
                </span>
                <Settings className="h-4 w-4 text-[var(--abu-text-tertiary)] group-hover:text-[var(--abu-text-secondary)]" aria-hidden="true" />
              </>
            ) : null}
          </button>
        </div>

        {!sidebarCollapsed ? (
          <div className="mt-4 px-2">
            <p className="text-caption font-medium uppercase tracking-[0.08em] text-[var(--abu-text-muted)]">
              {t.projectManagementPortal.moduleName}
            </p>
          </div>
        ) : null}

        <nav className={cn('space-y-1', sidebarCollapsed ? 'mt-4' : 'mt-2')} aria-label={t.projectManagementPortal.navigationLabel}>
          {navigation.map(({ view, icon: Icon, label }) => (
            <button
              key={view}
              type="button"
              aria-label={label}
              aria-current={activeView === view ? 'page' : undefined}
              onClick={() => setActiveView(view)}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex w-full items-center rounded-lg py-2 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]',
                sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
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
              {!sidebarCollapsed ? <span>{label}</span> : null}
            </button>
          ))}
        </nav>

        <button
          type="button"
          aria-label={t.projectManagementPortal.backToAbu}
          onClick={() => setViewMode('chat')}
          title={sidebarCollapsed ? t.projectManagementPortal.backToAbu : undefined}
          className={cn(
            'mt-auto flex w-full items-center rounded-lg py-2 text-body text-[var(--abu-text-secondary)] transition-colors hover:bg-[var(--abu-bg-hover)] hover:text-[var(--abu-text-primary)] active:bg-[var(--abu-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--abu-clay)]',
            sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
          )}
        >
          <ArrowLeft className="h-[18px] w-[18px] text-[var(--abu-text-tertiary)]" strokeWidth={1.75} aria-hidden="true" />
          {!sidebarCollapsed ? <span>{t.projectManagementPortal.backToAbu}</span> : null}
        </button>
      </aside>

      <main
        data-project-management-portal-content
        className="m-2 min-w-0 flex-1 overflow-hidden rounded-[var(--abu-radius-panel)] border border-[var(--abu-border)] bg-[var(--abu-bg-base)]"
      >
        {activeView === 'overview' ? <ProjectManagementWorkspace /> : activeView === 'meetings' ? (
          <MeetingWorkspace />
        ) : <ProjectManagementPortalModules view={activeView} />}
      </main>
    </div>
  );
}
