import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enterUpstreamChatFromProjectManagementPortal,
  isValidNativeHelperIdentity,
  PACKAGED_CHAT_PLACEHOLDER,
  requiredNativeHelperCommands,
} from './electron-packaged-smoke-contract.mjs';

function helloResponse(platform, supportedCommands) {
  return {
    id: 1,
    result: {
      protocol_version: 1,
      binary_version: '0.0.1',
      platform,
      started_at_ms: 1,
      supported_commands: supportedCommands,
    },
  };
}

test('Windows handshake requires only commands implemented by the Windows helper', () => {
  const commands = requiredNativeHelperCommands('win32');
  assert.deepEqual(commands, ['health', 'mouse_click', 'capture_screen']);
  assert.equal(
    isValidNativeHelperIdentity(
      helloResponse('windows', ['hello', ...commands]),
      0,
      'win32',
    ),
    true,
  );
});

test('macOS handshake additionally requires identity and AX commands', () => {
  const commonOnly = ['hello', ...requiredNativeHelperCommands('win32')];
  assert.equal(
    isValidNativeHelperIdentity(helloResponse('macos', commonOnly), 0, 'darwin'),
    false,
  );
  assert.equal(
    isValidNativeHelperIdentity(
      helloResponse('macos', ['hello', ...requiredNativeHelperCommands('darwin')]),
      0,
      'darwin',
    ),
    true,
  );
});

test('handshake still fails closed on protocol or process failure', () => {
  const response = helloResponse('windows', requiredNativeHelperCommands('win32'));
  assert.equal(isValidNativeHelperIdentity(response, 1, 'win32'), false);
  response.result.protocol_version = 2;
  assert.equal(isValidNativeHelperIdentity(response, 0, 'win32'), false);
});

test('packaged startup proves PM first, then returns to the upstream Abu chat shell', async () => {
  const calls = [];
  const expectedSelectors = new Set([
    '[data-project-management-portal]',
    '[data-project-management-workspace]',
    '[data-project-management-portal-sidebar]',
  ]);
  const page = {
    locator(selector) {
      assert.equal(expectedSelectors.has(selector), true);
      return {
        async waitFor(options) {
          calls.push(['wait', selector, options]);
        },
      };
    },
    getByRole(role, options) {
      assert.equal(role, 'button');
      assert.equal(options.name.test('Back to Abu'), true);
      return {
        async click() {
          calls.push(['click', 'back-to-abu']);
        },
      };
    },
    getByPlaceholder(pattern) {
      assert.equal(pattern, PACKAGED_CHAT_PLACEHOLDER);
      assert.equal(pattern.test('What can Abu help you with?'), true);
      return {
        async waitFor(options) {
          calls.push(['wait', 'chat-input', options]);
        },
      };
    },
  };

  const checks = await enterUpstreamChatFromProjectManagementPortal(page, 1234);

  assert.deepEqual(calls, [
    ['wait', '[data-project-management-portal]', { state: 'visible', timeout: 1234 }],
    ['wait', '[data-project-management-workspace]', { state: 'visible', timeout: 1234 }],
    ['wait', '[data-project-management-portal-sidebar]', { state: 'visible', timeout: 1234 }],
    ['click', 'back-to-abu'],
    ['wait', 'chat-input', { state: 'visible', timeout: 1234 }],
  ]);
  assert.deepEqual(checks, {
    packagedProjectManagementPortalVisible: true,
    packagedProjectOverviewVisible: true,
    packagedProjectManagementSidebarVisible: true,
    packagedReturnedToAbuChat: true,
  });
});
