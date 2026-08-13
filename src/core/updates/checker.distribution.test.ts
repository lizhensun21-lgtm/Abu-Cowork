import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';

const mockCheck = vi.fn();
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => mockCheck(),
}));
vi.mock('@/core/notice/bus', () => ({ publish: vi.fn() }));
vi.mock('@/utils/version', () => ({
  ABU_DISTRIBUTION: 'abu-project-management',
}));

import { checkForUpdate, downloadAndInstallUpdate } from './checker';

describe('project-management updater distribution', () => {
  beforeEach(() => {
    mockCheck.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    useSettingsStore.setState({
      lastUpdateCheck: 0,
      updateInfo: null,
      updateChecking: false,
      updateDownloadProgress: null,
      updateInstalling: false,
    });
  });

  it('does not check Tauri or upstream release metadata', async () => {
    await expect(checkForUpdate(true)).resolves.toBeNull();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects download before a pending update can be used', async () => {
    await expect(downloadAndInstallUpdate()).rejects.toThrow(
      'Updater disabled for distribution: abu-project-management',
    );
  });
});
