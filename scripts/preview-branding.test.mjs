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

test('builder and package metadata use the centralized Preview identity', () => {
  assert.equal(manifest.name, 'abu-project-management-preview');
  assert.equal(manifest.version, '0.1.0-rc.1');
  assert.equal(builder.appId, identity.appId);
  assert.equal(builder.productName, identity.displayName);
  assert.equal(builder.extraMetadata.abuRelease.distribution, identity.distribution);
  assert.equal(builder.extraMetadata.abuRelease.upstreamBaseVersion, identity.upstreamBaseVersion);
  assert.equal(builder.win.executableName, identity.executableName);
  assert.equal(builder.nsis.uninstallDisplayName, identity.displayName);
  assert.equal(builder.nsis.shortcutName, identity.displayName);
  assert.deepEqual(builder.protocols[0].schemes, [identity.protocol]);
  assert.equal(
    builder.nsis.artifactName,
    'Abu-Project-Management-RC1-Preview-windows-${arch}-setup.${ext}'
  );
  assert.equal(builder.nsis.oneClick, true);
  assert.equal(builder.nsis.perMachine, false);
  assert.equal(builder.nsis.createDesktopShortcut, true);
  assert.equal(builder.nsis.createStartMenuShortcut, true);
  assert.equal(builder.nsis.runAfterFinish, false);
  assert.equal(builder.nsis.include, undefined);
});

test('strict builder allowlist explicitly packages the legal contract', () => {
  assert.ok(builder.files.includes('product-identity.json'));
  const legalResources = new Map(
    builder.extraResources
      .filter((entry) => typeof entry === 'object' && entry.from)
      .map((entry) => [entry.from, entry.to])
  );
  assert.equal(legalResources.get('LICENSE'), 'legal/LICENSE');
  assert.equal(legalResources.get('DISCLAIMER.md'), 'legal/DISCLAIMER.md');
  assert.equal(
    legalResources.get('DISCLAIMER.zh-CN.md'),
    'legal/DISCLAIMER.zh-CN.md'
  );
  assert.equal(
    legalResources.get('THIRD_PARTY_NOTICES.md'),
    'legal/THIRD_PARTY_NOTICES.md'
  );
  assert.match(read('LICENSE'), /Copyright 2026 Shawn/);
});

test('runtime UI has no upstream personal Feedback or Sponsor surface', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'src/components/settings/sections/FeedbackSection.tsx')),
    false
  );
  assert.equal(
    fs.existsSync(path.join(root, 'src/components/settings/sections/SponsorSection.tsx')),
    false
  );
  for (const asset of [
    'src/assets/wechat-qr.png',
    'src/assets/sponsor-qr.png',
    'src/assets/sponsor-qr.jpeg',
  ]) {
    assert.equal(fs.existsSync(path.join(root, asset)), false, asset);
  }
  assert.doesNotMatch(read('src/components/settings/SystemSettingsModal.tsx'), /FeedbackSection|id: 'feedback'/);
  assert.doesNotMatch(read('src/components/sidebar/AccountMenu.tsx'), /openSystemSettings\('feedback'\)/);
  assert.match(read('src/components/settings/sections/DiagnosticSection.tsx'), /<DiagnosticUpload/);
});

test('About presents Preview, local JSON, legal links, and no personal promotion', () => {
  const about = read('src/components/settings/sections/AboutSection.tsx');
  const english = read('src/i18n/locales/en-US.ts');
  assert.match(english, /appName: 'Abu Project Management'/);
  assert.match(english, /appSlogan: 'RC1 Preview'/);
  assert.match(english, /projectManagementEdition: 'Project Management Edition'/);
  assert.match(english, /dataModeLocalJson: 'Local JSON'/);
  assert.match(about, /t\.updates\.dataModeLocalJson/);
  assert.match(about, /LICENSE_URL/);
  assert.match(about, /UPSTREAM_SOURCE_URL/);
  assert.doesNotMatch(about, /Made with|xhslink|wechat|sponsor/i);
});

test('fork README removes upstream personal publication blocks', () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const contents = read(file);
    assert.match(contents, /Abu Project Management/);
    assert.match(contents, /Copyright 2026 Shawn/);
    assert.doesNotMatch(contents, /src\/assets\/(wechat-qr|sponsor-qr)|pmshawn@163\.com|xhslink/i);
  }
});
