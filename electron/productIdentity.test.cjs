'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const identity = require('./productIdentity.cjs');
const { abuAppDataDir } = require('./appEnv.cjs');
const {
  DEV_SCHEME,
  PROD_SCHEME,
  __resetForTest,
  normalizeDeepLinkUrl,
} = require('./deepLinkHost.cjs');

test('Preview identity is distinct from upstream and development namespaces', () => {
  assert.equal(identity.displayName, 'Abu Project Management');
  assert.equal(identity.previewLabel, 'RC1 Preview');
  assert.equal(identity.appId, 'com.abu.projectmanagement.preview');
  assert.equal(identity.protocol, 'abu-project-management-preview');
  assert.notEqual(identity.appId, 'com.abu.app');
  assert.notEqual(identity.protocol, 'abu');
  assert.notEqual(identity.packagedDomainDataNamespace, 'com.abu.app.electron');
  assert.notEqual(
    identity.packagedDomainDataNamespace,
    identity.developmentDomainDataNamespace
  );
  assert.notEqual(
    identity.packagedUserDataNamespace,
    identity.packagedDomainDataNamespace
  );
});

test('packaged app data resolves only to the Preview namespace', () => {
  const appData = path.resolve('C:/isolated-app-data');
  const app = {
    isPackaged: true,
    getPath(name) {
      assert.equal(name, 'appData');
      return appData;
    },
  };
  assert.equal(
    abuAppDataDir(app),
    path.join(appData, identity.packagedDomainDataNamespace)
  );
});

test('deep links use only the fork protocol identity', () => {
  __resetForTest();
  assert.equal(PROD_SCHEME, identity.protocol);
  assert.equal(DEV_SCHEME, identity.devProtocol);
  assert.equal(
    normalizeDeepLinkUrl(
      `${DEV_SCHEME}://enroll?server=https://example.com&token=preview`
    ),
    `${PROD_SCHEME}://enroll?server=https://example.com&token=preview`
  );
  assert.equal(
    normalizeDeepLinkUrl(`${PROD_SCHEME}://enroll?server=https://example.com`),
    `${PROD_SCHEME}://enroll?server=https://example.com`
  );
  assert.equal(normalizeDeepLinkUrl('abu://enroll?server=https://example.com'), null);
});
