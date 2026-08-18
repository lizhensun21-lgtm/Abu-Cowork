import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import ProjectManagementPortal, {
  DEFAULT_PROJECT_MANAGEMENT_PORTAL_VIEW,
} from './ProjectManagementPortal';

vi.mock('@/components/project-management/ProjectManagementWorkspace', () => ({
  default: () => <div data-testid="project-management-workspace">Project Overview Workspace</div>,
}));
vi.mock('@/components/project-management/meeting/MeetingWorkspace', () => ({
  default: () => <div data-testid="meeting-workspace"><h1>Meetings</h1></div>,
}));
vi.mock('./ProjectManagementPortalModules', () => ({
  default: ({ view }: { view: string }) => <div data-testid={`portal-module-${view}`}>{view}</div>,
}));

describe('ProjectManagementPortal', () => {
  beforeEach(() => {
    setLanguage('en-US');
    useSettingsStore.setState({
      viewMode: 'project-management',
      userNickname: '',
      userAvatar: '',
      systemSettingsOpen: false,
    });
  });

  it('defaults its local navigation to overview and mounts the existing PM workspace', () => {
    expect(DEFAULT_PROJECT_MANAGEMENT_PORTAL_VIEW).toBe('overview');
    render(<ProjectManagementPortal />);

    expect(screen.getByRole('button', { name: 'Project Overview' }))
      .toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('project-management-workspace')).toBeInTheDocument();
    expect(screen.queryByText('New Task')).not.toBeInTheDocument();
  });

  it('switches local portal views without changing the top-level Desktop view mode', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortal />);

    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    expect(screen.getByRole('heading', { name: 'Meetings' })).toBeInTheDocument();
    expect(screen.getByTestId('meeting-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('project-management-workspace')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().viewMode).toBe('project-management');

    await user.click(screen.getByRole('button', { name: 'Project Overview' }));
    expect(screen.getByTestId('project-management-workspace')).toBeInTheDocument();
  });

  it('routes every I10 entry to a real module while preserving sidebar state', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortal />);
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    for (const [label, view] of [['Calendar', 'calendar'], ['Ledger', 'ledger'], ['Resources', 'resources'], ['Members', 'members']] as const) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId(`portal-module-${view}`)).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Project Management navigation' })).toHaveAttribute('data-collapsed', 'true');
      expect(useSettingsStore.getState().viewMode).toBe('project-management');
    }
  });

  it('returns to Original Abu through the existing viewMode action', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortal />);

    await user.click(screen.getByRole('button', { name: 'Back to Abu' }));
    expect(useSettingsStore.getState().viewMode).toBe('chat');
  });

  it('shows the current Abu profile and opens the existing settings overlay', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ userNickname: 'Taylor', userAvatar: '' });
    render(<ProjectManagementPortal />);

    await user.click(screen.getByRole('button', { name: 'Taylor' }));
    expect(useSettingsStore.getState().systemSettingsOpen).toBe(true);
  });

  it('collapses to an icon rail, expands the workspace, and preserves the state across portal navigation', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortal />);
    const sidebar = screen.getByRole('complementary', { name: 'Project Management navigation' });
    const content = document.querySelector<HTMLElement>('[data-project-management-portal-content]')!;

    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(sidebar).toHaveClass('w-[232px]');
    expect(content.className).not.toContain('shadow');

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(sidebar).toHaveClass('w-[56px]');
    expect(sidebar).not.toHaveClass('w-[232px]');
    expect(within(sidebar).queryByText('Project Management')).not.toBeInTheDocument();
    expect(within(sidebar).queryByText('Project Overview')).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: 'Project Overview' }))
      .toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('button', { name: 'Back to Abu' })).toHaveAttribute('title', 'Back to Abu');

    await user.click(within(sidebar).getByRole('button', { name: 'Meetings' }));
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(within(sidebar).getByRole('button', { name: 'Meetings' }))
      .toHaveAttribute('aria-current', 'page');

    await user.click(within(sidebar).getByRole('button', { name: 'Show sidebar' }));
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(within(sidebar).getByText('Meetings')).toBeInTheDocument();
  });

  it('contains no repository, graph mutation, persistence, or mock-data path', () => {
    const source = readFileSync(
      resolve('src/components/project-management/portal/ProjectManagementPortal.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/Repository|setState|setGraph|localStorage|mockData/);
  });
});
