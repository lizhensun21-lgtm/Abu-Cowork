import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const identity = JSON.parse(read('product-identity.json'));
const builder = YAML.parse(read('electron-builder.yml'));
const manifest = JSON.parse(read('package.json'));

test('package and builder metadata implement the centralized Preview identity', () => {
  assert.equal(manifest.name, 'abu-project-management-preview');
  assert.equal(manifest.version, identity.productVersion);
  assert.equal(manifest.description, identity.displayName);
  assert.equal(builder.appId, identity.appId);
  assert.equal(builder.productName, identity.displayName);
  assert.equal(builder.extraMetadata.abuRelease.distribution, identity.distribution);
  assert.equal(builder.extraMetadata.abuRelease.upstreamBaseVersion, identity.upstreamBaseVersion);
  assert.equal(builder.extraMetadata.abuRelease.officialBuild, identity.officialBuild);
  assert.equal(builder.win.executableName, identity.executableName);
  assert.equal(
    manifest.scripts['verify:preview:windows-package'],
    'node scripts/verify-preview-windows-package.mjs',
  );
  assert.deepEqual(builder.protocols.flatMap((entry) => entry.schemes), [identity.protocol]);
});

test('Windows Preview installer identity and per-user shortcut policy are locked', () => {
  assert.deepEqual(builder.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(builder.win.artifactName, identity.windowsArtifactName);
  assert.equal(builder.nsis.artifactName, identity.windowsArtifactName);
  assert.equal(builder.nsis.oneClick, true);
  assert.equal(builder.nsis.perMachine, false);
  assert.equal(builder.nsis.allowElevation, false);
  assert.equal(builder.nsis.packElevateHelper, false);
  assert.equal(builder.nsis.createDesktopShortcut, true);
  assert.equal(builder.nsis.createStartMenuShortcut, true);
  assert.equal(builder.nsis.shortcutName, identity.displayName);
  assert.equal(builder.nsis.uninstallDisplayName, identity.displayName);
  assert.equal(builder.nsis.runAfterFinish, false);
  assert.equal(builder.nsis.include, undefined);
});

test('Preview packages legal files and has no updater feed or PM server runtime', () => {
  assert.equal(identity.projectManagementDataMode, 'local-json');
  assert.equal(builder.publish, null);
  assert.equal(builder.extraMetadata.abuRelease.officialBuild, false);
  assert.equal(builder.extraMetadata.abuRelease.tauriMigration, false);

  const resources = new Map(
    builder.extraResources
      .filter((entry) => typeof entry === 'object' && entry.from)
      .map((entry) => [entry.from, entry.to]),
  );
  for (const legalFile of [
    'legal/LICENSE',
    'legal/DISCLAIMER.md',
    'legal/DISCLAIMER.zh-CN.md',
    'legal/THIRD_PARTY_NOTICES.md',
  ]) {
    assert.equal(resources.get(legalFile), legalFile);
    assert.equal(fs.existsSync(path.join(root, legalFile)), true);
  }
  assert.match(read('legal/LICENSE'), /Copyright 2026 Shawn/);
  assert.equal(builder.files.some((entry) => /server|compose|spring|postgres/i.test(entry)), false);
});

test('Preview settings navigation has no personal Feedback or Sponsor route', () => {
  const settings = read('src/components/settings/SystemSettingsModal.tsx');
  const accountMenu = read('src/components/sidebar/AccountMenu.tsx');
  const about = read('src/components/settings/sections/AboutSection.tsx');
  assert.doesNotMatch(settings, /id:\s*['"](?:feedback|sponsor)['"]/i);
  assert.doesNotMatch(accountMenu, /openSystemSettings\(['"](?:feedback|sponsor)['"]\)/i);
  assert.doesNotMatch(about, /wechat-qr|sponsor-qr|xhslink|Made with/i);
});

test('real WeChat binding QR code capability remains part of the product', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/components/settings/sections/WeChatQRPanel.tsx')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/core/im/adapters/wechat.ts')), true);
  assert.equal(typeof manifest.dependencies.qrcode, 'string');
});

test('Preview renderer and sidecar builds share product and upstream version inputs', () => {
  assert.match(read('vite.config.ts'), /productIdentity\.productVersion/);
  assert.match(read('vite.config.ts'), /productIdentity\.upstreamBaseVersion/);
  assert.match(read('scripts/build-sidecar.mjs'), /productIdentity\.productVersion/);
  assert.match(read('scripts/build-sidecar.mjs'), /productIdentity\.upstreamBaseVersion/);
});

test('Preview About and PM runtime share one typed data-mode identity', () => {
  const identitySource = read('src/config/productIdentity.ts');
  const about = read('src/components/settings/sections/AboutSection.tsx');
  const connection = read('src/project-management/api/pmServerConnection.ts');
  assert.match(identitySource, /ProjectManagementDataMode = 'local-json' \| 'server'/);
  assert.match(about, /PRODUCT_DATA_MODE_LABEL/);
  assert.match(connection, /PROJECT_MANAGEMENT_DATA_MODE/);
});
