import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

export interface PortalUserViewModel {
  displayName: string;
  avatarUrl: string | null;
}

export function adaptPortalUser(
  userNickname: string,
  userAvatar: string,
  fallbackDisplayName: string,
): PortalUserViewModel {
  return {
    displayName: userNickname.trim() || fallbackDisplayName,
    avatarUrl: userAvatar.trim() || null,
  };
}

/**
 * Read-only boundary over Abu's existing local profile. This is application
 * identity only: it must never be treated as a Project Management Person or
 * used as an assignee fallback.
 */
export function usePortalUserAdapter() {
  const { t } = useI18n();
  const userNickname = useSettingsStore((state) => state.userNickname);
  const userAvatar = useSettingsStore((state) => state.userAvatar);
  const openSystemSettings = useSettingsStore((state) => state.openSystemSettings);

  return {
    user: adaptPortalUser(userNickname, userAvatar, t.sidebar.defaultNickname),
    openAccountSettings: openSystemSettings,
  };
}
