'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const identity = require('./productIdentity.cjs');
const { abuAppDataDir } = require('./appEnv.cjs');
const {
  DEV_SCHEME,
  PROD_SCHEME,
  normalizeDeepLinkUrl,
} = require('./deepLinkHost.cjs');

test('Preview product and upstream identities remain independently expressible', () => {
  assert.equal(identity.displayName, 'Abu Project Management');
  assert.equal(identity.productVersion, '0.1.0-rc.1');
  assert.equal(identity.upstreamBaseVersion, '0.41.0');
  assert.equal(identity.editionLabel, 'Project Management Edition');
  assert.equal(identity.channelLabel, 'RC1 Preview');
  assert.equal(identity.projectManagementDataMode, 'local-json');
  assert.equal(identity.dataModeLabel, 'Local JSON');
  assert.equal(identity.distribution, 'abu-project-management');
  assert.equal(identity.officialBuild, false);
});

test('Preview application and data identities do not collide with upstream or prior dev data', () => {
  assert.equal(identity.appId, 'com.abu.projectmanagement.preview');
  assert.equal(identity.domainDataNamespace, 'com.abu.projectmanagement.preview');
  assert.equal(identity.userDataNamespace, 'com.abu.projectmanagement.preview.user-data');
  assert.equal(identity.e2eUserDataNamespace, 'com.abu.projectmanagement.preview.e2e-user-data');

  const forbidden = new Set([
    'com.abu.app',
    'com.abu.app.electron',
    'com.abu.app.electron-dev',
  ]);
  assert.equal(forbidden.has(identity.domainDataNamespace), false);
  assert.equal(forbidden.has(identity.userDataNamespace), false);
  assert.equal(forbidden.has(identity.e2eUserDataNamespace), false);

  const appData = path.resolve('C:/isolated-preview-app-data');
  const app = { getPath: (name) => {
    assert.equal(name, 'appData');
    return appData;
  } };
  assert.equal(abuAppDataDir(app), path.join(appData, identity.domainDataNamespace));
});

test('deep links accept only fork protocols and normalize dev to packaged Preview', () => {
  assert.equal(PROD_SCHEME, 'abu-project-management-preview');
  assert.equal(DEV_SCHEME, 'abu-project-management-preview-dev');
  assert.equal(
    normalizeDeepLinkUrl(`${DEV_SCHEME}://enroll?server=https://example.com&token=preview`),
    `${PROD_SCHEME}://enroll?server=https://example.com&token=preview`,
  );
  assert.equal(
    normalizeDeepLinkUrl(`${PROD_SCHEME}://enroll?server=https://example.com`),
    `${PROD_SCHEME}://enroll?server=https://example.com`,
  );
  assert.equal(normalizeDeepLinkUrl('abu://enroll?server=https://example.com'), null);
  assert.equal(normalizeDeepLinkUrl(`${PROD_SCHEME}://unknown?server=x`), null);
});
