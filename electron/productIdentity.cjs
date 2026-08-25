'use strict';

const identity = require('../product-identity.json');

const requiredStrings = [
  'displayName',
  'productVersion',
  'upstreamBaseVersion',
  'editionLabel',
  'channelLabel',
  'projectManagementDataMode',
  'distribution',
  'appId',
  'executableName',
  'windowsArtifactName',
  'protocol',
  'devProtocol',
  'domainDataNamespace',
  'userDataNamespace',
  'e2eUserDataNamespace',
];

for (const key of requiredStrings) {
  if (typeof identity[key] !== 'string' || identity[key].trim() === '') {
    throw new Error(`Invalid product identity field: ${key}`);
  }
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(identity.productVersion)) {
  throw new Error('Invalid product identity field: productVersion');
}
if (!/^\d+\.\d+\.\d+$/.test(identity.upstreamBaseVersion)) {
  throw new Error('Invalid product identity field: upstreamBaseVersion');
}
if (identity.officialBuild !== false) {
  throw new Error('Preview product identity must set officialBuild=false');
}
if (!['local-json', 'server'].includes(identity.projectManagementDataMode)) {
  throw new Error('Invalid product identity field: projectManagementDataMode');
}

const dataModeLabels = Object.freeze({
  'local-json': 'Local JSON',
  server: 'Server',
});

module.exports = Object.freeze({
  ...identity,
  dataModeLabel: dataModeLabels[identity.projectManagementDataMode],
});
