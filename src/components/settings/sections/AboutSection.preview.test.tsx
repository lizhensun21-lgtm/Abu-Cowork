// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import AboutSection from './AboutSection';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/utils/deviceId', () => ({ getDeviceId: () => 'preview-device-id' }));
vi.mock('@/core/updates/checker', () => ({
  checkForUpdate: vi.fn(),
  downloadAndInstallUpdate: vi.fn(),
  restartApp: vi.fn(),
  refreshUpdateNotes: vi.fn(),
}));

describe('Preview About business contract', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      language: 'en-US',
      updateInfo: null,
      updateChecking: false,
      updateDownloadProgress: null,
      updateInstalling: false,
    });
  });

  it('shows product, upstream, local data, disabled updater, and legal identity', () => {
    render(<AboutSection />);
    expect(screen.getByText('Abu Project Management')).toBeInTheDocument();
    expect(screen.getByText('RC1 Preview')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0-rc.1')).toBeInTheDocument();
    expect(screen.getByText('Project Management Edition')).toBeInTheDocument();
    expect(screen.getByText('Abu 0.41.0')).toBeInTheDocument();
    expect(screen.getByText('Local JSON')).toBeInTheDocument();
    expect(screen.getByText('abu-project-management')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apache 2.0 License' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disclaimer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upstream source' })).toBeInTheDocument();
  });

  it('does not expose upstream update actions or personal promotion', () => {
    render(<AboutSection />);
    expect(screen.queryByText(/check for updates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Made with/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Contact Developer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Support$/i)).not.toBeInTheDocument();
  });
});
