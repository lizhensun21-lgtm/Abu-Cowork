'use strict';

const identity = require('../product-identity.json');

const requiredStrings = [
  'displayName',
  'previewLabel',
  'editionLabel',
  'distribution',
  'upstreamBaseVersion',
  'appId',
  'executableName',
  'protocol',
  'devProtocol',
  'packagedDomainDataNamespace',
  'packagedUserDataNamespace',
  'packagedE2EUserDataNamespace',
  'developmentApplicationName',
  'developmentDomainDataNamespace',
];

for (const key of requiredStrings) {
  if (typeof identity[key] !== 'string' || identity[key].trim() === '') {
    throw new Error(`Invalid product identity field: ${key}`);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(identity.upstreamBaseVersion)) {
  throw new Error('Invalid product identity field: upstreamBaseVersion');
}

module.exports = Object.freeze(identity);
