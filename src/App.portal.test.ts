// @vitest-environment happy-dom

import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import ProjectManagementPortal from '@/components/project-management/portal/ProjectManagementPortal';
import WindowTitleBar from '@/components/window/WindowTitleBar';

const { initializePmServerConnection, refreshPmServerConnection } = vi.hoisted(() => ({
  initializePmServerConnection: vi.fn().mockResolvedValue(undefined),
  refreshPmServerConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/project-management/api/pmServerConnection', () => ({
  initializePmServerConnection,
  isPmServerRuntimeEnabled: () => false,
  refreshPmServerConnection,
  usePmServerConnectionState: () => 'disabled',
}));

vi.mock('@/components/project-management/ProjectManagementWorkspace', () => ({
  default: () => createElement('div', { 'data-testid': 'project-overview-root' }, 'Project Overview'),
}));
vi.mock('@/components/project-management/meeting/MeetingWorkspace', () => ({
  default: () => createElement('div', null, 'Meetings'),
}));
vi.mock('@/components/project-management/portal/ProjectManagementPortalModules', () => ({
  default: ({ view }: { view: string }) => createElement('div', null, view),
}));

const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');

function titleBarProps(onOpenProjectManagementPortal: () => void) {
  return {
    platform: 'windows' as const,
    windowsTitleBarOverlay: false,
    sidebarCollapsed: false,
    showSidebarToggle: true,
    showProjectManagementPortal: true,
    showSearch: true,
    showNewTask: true,
    showRightPanelToggle: false,
    rightPanelCollapsed: true,
    onToggleSidebar: vi.fn(),
    onOpenProjectManagementPortal,
    onOpenSearch: vi.fn(),
    onNewTask: vi.fn(),
    onToggleRightPanel: vi.fn(),
    onOpenWindowMenu: vi.fn(),
    labels: {
      appName: 'Abu',
      editMenu: 'Edit',
      windowMenu: 'Window',
      helpMenu: 'Help',
      showSidebar: 'Show sidebar',
      hideSidebar: 'Hide sidebar',
      projectManagement: 'Project Management',
      search: 'Search',
      newTask: 'New task',
      showPanel: 'Show panel',
      hidePanel: 'Hide panel',
    },
  };
}

describe('App Project Management Portal business contract', () => {
  beforeEach(() => {
    setLanguage('en-US');
    useSettingsStore.setState({ viewMode: 'project-management' });
    vi.clearAllMocks();
  });

  it('keeps Project Management as the persisted startup default', () => {
    expect(useSettingsStore.getInitialState().viewMode).toBe('project-management');
    expect(useSettingsStore.getState().viewMode).toBe('project-management');
  });

  it('mounts the Portal root, Project Overview, and its own sidebar, then returns to Abu', async () => {
    const user = userEvent.setup();
    const { container } = render(createElement(ProjectManagementPortal));

    expect(container.querySelector('[data-project-management-portal]')).not.toBeNull();
    expect(container.querySelector('[data-project-management-portal-sidebar]')).not.toBeNull();
    expect(screen.getByTestId('project-overview-root')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to Abu' }));
    expect(useSettingsStore.getState().viewMode).toBe('chat');
  });

  it('uses the WindowTitleBar PM entry to return from the Abu shell to the Portal', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ viewMode: 'chat' });
    render(createElement(
      WindowTitleBar,
      titleBarProps(() => useSettingsStore.getState().setViewMode('project-management')),
    ));

    await user.click(screen.getByRole('button', { name: 'Project Management' }));
    expect(useSettingsStore.getState().viewMode).toBe('project-management');
  });

  it('keeps the upstream Abu chat shell and v0.41 lifecycle/bootstrap wiring', () => {
    expect(appSource).toContain("const projectManagementPortalActive = viewMode === 'project-management'");
    expect(appSource).toContain('ProjectManagementPortal');
    expect(appSource).toContain('ChatView');
    expect(appSource).toContain('consumeComputerUseResumeToken');
    expect(appSource).toContain('subscribeShellCrashReports');
    expect(appSource).toContain('registerBuiltinTools');
    expect(appSource).toContain('bootstrapSecrets');
  });
});
