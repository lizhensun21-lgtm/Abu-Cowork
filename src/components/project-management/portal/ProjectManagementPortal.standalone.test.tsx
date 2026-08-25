// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import ProjectManagementPortal from './ProjectManagementPortal';

vi.mock('@/components/project-management/ProjectManagementWorkspace', () => ({
  default: () => <div data-testid="standalone-project-overview">Project Overview Workspace</div>,
}));
vi.mock('@/components/project-management/meeting/MeetingWorkspace', () => ({
  default: () => <div>Meetings</div>,
}));
vi.mock('./ProjectManagementPortalModules', () => ({
  default: ({ view }: { view: string }) => <div>{view}</div>,
}));

describe('Preview standalone Project Management Portal', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PM_API_BASE_URL', '');
    setLanguage('en-US');
    useSettingsStore.setState({
      viewMode: 'project-management',
      userNickname: '',
      userAvatar: '',
      systemSettingsOpen: false,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('mounts Project Overview without a base URL or PM health request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(() => render(<ProjectManagementPortal />)).not.toThrow();

    expect(screen.getByRole('button', { name: 'Project Overview' }))
      .toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('standalone-project-overview')).toBeInTheDocument();
    expect(document.querySelector('[data-project-management-portal]'))
      .toHaveAttribute('data-pm-server-connection', 'disabled');
    window.dispatchEvent(new Event('focus'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
