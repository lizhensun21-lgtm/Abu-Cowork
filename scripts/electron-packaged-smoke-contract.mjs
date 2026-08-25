const COMMON_NATIVE_HELPER_COMMANDS = Object.freeze([
  'health',
  'mouse_click',
  'capture_screen',
]);

const MACOS_NATIVE_HELPER_COMMANDS = Object.freeze([
  'frontmost_app_identity',
  'ax_snapshot',
]);

export const PACKAGED_CHAT_PLACEHOLDER = /想让阿布帮你做点什么？|What can Abu help you with\?/;
export const PACKAGED_BACK_TO_ABU_NAME = /^(返回 Abu|Back to Abu)$/;

/**
 * Assert the fork's PM-first packaged startup, then cross the supported Portal
 * boundary into the upstream Abu chat shell. Keeping this sequence in the
 * contract module lets the lightweight node:test suite verify the fork
 * adaptation without launching or repackaging Electron.
 */
export async function enterUpstreamChatFromProjectManagementPortal(page, timeout) {
  const portal = page.locator('[data-project-management-portal]');
  const overview = page.locator('[data-project-management-workspace]');
  const sidebar = page.locator('[data-project-management-portal-sidebar]');

  await portal.waitFor({ state: 'visible', timeout });
  await overview.waitFor({ state: 'visible', timeout });
  await sidebar.waitFor({ state: 'visible', timeout });
  await page.getByRole('button', { name: PACKAGED_BACK_TO_ABU_NAME }).click();
  await page.getByPlaceholder(PACKAGED_CHAT_PLACEHOLDER).waitFor({
    state: 'visible',
    timeout,
  });

  return {
    packagedProjectManagementPortalVisible: true,
    packagedProjectOverviewVisible: true,
    packagedProjectManagementSidebarVisible: true,
    packagedReturnedToAbuChat: true,
  };
}

/**
 * Prove the upstream shell's WindowTitleBar entry can reopen the PM Portal,
 * then return to Chat so the remaining upstream packaged checks keep running
 * from the shell they exercise.
 */
export async function roundTripProjectManagementPortalFromUpstreamChat(page, timeout) {
  const portalEntry = page.locator('[data-window-control="project-management"]');
  await portalEntry.waitFor({ state: 'visible', timeout });
  await portalEntry.click();

  await page.locator('[data-project-management-portal]').waitFor({
    state: 'visible',
    timeout,
  });
  await page.locator('[data-project-management-workspace]').waitFor({
    state: 'visible',
    timeout,
  });
  await page.locator('[data-project-management-portal-sidebar]').waitFor({
    state: 'visible',
    timeout,
  });
  await page.getByRole('button', { name: PACKAGED_BACK_TO_ABU_NAME }).click();
  await page.getByPlaceholder(PACKAGED_CHAT_PLACEHOLDER).waitFor({
    state: 'visible',
    timeout,
  });

  return {
    packagedWindowTitlebarReturnedToProjectManagementPortal: true,
    packagedReturnedFromTitlebarPortalToAbuChat: true,
  };
}

export function requiredNativeHelperCommands(platform) {
  return platform === 'darwin'
    ? [...COMMON_NATIVE_HELPER_COMMANDS, ...MACOS_NATIVE_HELPER_COMMANDS]
    : [...COMMON_NATIVE_HELPER_COMMANDS];
}

export function isValidNativeHelperIdentity(response, status, platform) {
  const identity = response?.result;
  return status === 0 &&
    response?.id === 1 &&
    identity?.protocol_version === 1 &&
    typeof identity?.binary_version === 'string' &&
    identity.binary_version.length > 0 &&
    typeof identity?.platform === 'string' &&
    typeof identity?.started_at_ms === 'number' &&
    Array.isArray(identity?.supported_commands) &&
    requiredNativeHelperCommands(platform).every((command) =>
      identity.supported_commands.includes(command),
    );
}
