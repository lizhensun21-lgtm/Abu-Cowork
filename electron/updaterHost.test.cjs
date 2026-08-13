'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const HOST_PATH = require.resolve('./updaterHost.cjs');

function loadHost(metadata) {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'abu-updater-identity-'));
  fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify({ abuRelease: metadata }));

  const app = {
    isPackaged: true,
    getAppPath: () => appPath,
    getVersion: () => '0.34.2',
    on: () => {},
  };
  const calls = { updaterLoads: 0, checks: 0, downloads: 0, installs: 0 };
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null,
    checkForUpdates: async () => {
      calls.checks++;
      return { isUpdateAvailable: false };
    },
    downloadUpdate: async () => {
      calls.downloads++;
    },
    quitAndInstall: () => {
      calls.installs++;
    },
    on: () => {},
    removeListener: () => {},
  };

  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'electron') return { app };
    if (request === 'electron-updater') {
      calls.updaterLoads++;
      return { autoUpdater };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[HOST_PATH];
  const host = require(HOST_PATH);

  return {
    appPath,
    autoUpdater,
    calls,
    host,
    cleanup: () => {
      Module._load = originalLoad;
      delete require.cache[HOST_PATH];
      fs.rmSync(appPath, { recursive: true, force: true });
    },
  };
}

test('project management distribution cannot check, download, or install upstream updates', async (t) => {
  const fixture = loadHost({
    distribution: 'abu-project-management',
    officialBuild: false,
  });
  t.after(fixture.cleanup);

  assert.equal(await fixture.host.updaterDispatch('plugin:updater|check'), null);
  assert.equal(fixture.calls.updaterLoads, 0);
  assert.equal(fixture.calls.checks, 0);
  await assert.rejects(
    fixture.host.updaterDispatch('plugin:updater|download_and_install'),
    /updater disabled for distribution: abu-project-management/
  );
  assert.equal(fixture.calls.downloads, 0);
  assert.equal(fixture.host.hasPendingInstall(), false);
  assert.equal(fixture.host.quitAndInstallIfPending(), false);
  assert.equal(fixture.calls.installs, 0);
});

test('upstream official updater keeps download manual and never installs on ordinary quit', async (t) => {
  const fixture = loadHost({
    distribution: 'upstream-official',
    officialBuild: true,
  });
  t.after(fixture.cleanup);

  assert.equal(await fixture.host.updaterDispatch('plugin:updater|check'), null);
  assert.equal(fixture.calls.updaterLoads, 1);
  assert.equal(fixture.calls.checks, 1);
  assert.equal(fixture.autoUpdater.autoDownload, false);
  assert.equal(fixture.autoUpdater.autoInstallOnAppQuit, false);
});
