import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('This workspace is not available yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('project-management-workspace')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().viewMode).toBe('project-management');

    await user.click(screen.getByRole('button', { name: 'Project Overview' }));
    expect(screen.getByTestId('project-management-workspace')).toBeInTheDocument();
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

  it('contains no repository, graph mutation, persistence, or mock-data path', () => {
    const source = readFileSync(
      resolve('src/components/project-management/portal/ProjectManagementPortal.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/Repository|setState|setGraph|localStorage|mockData/);
  });
});
