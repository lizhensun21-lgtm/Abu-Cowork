'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Read metadata embedded by electron-builder into the packaged package.json.
 * The base config keeps migration disabled; release CI is the only place that
 * may override the exact boolean to true.
 */
function readReleaseMetadata(app, options = {}) {
  if (!app || app.isPackaged !== true) return null;
  try {
    const appPath = options.appPath || app.getAppPath();
    const readFileSync = options.readFileSync || fs.readFileSync;
    const manifest = JSON.parse(
      readFileSync(path.join(appPath, 'package.json'), 'utf8')
    );
    const metadata = manifest?.abuRelease;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : null;
  } catch {
    return null;
  }
}

function isTauriTransitionBuild(app, options) {
  return readReleaseMetadata(app, options)?.tauriMigration === true;
}

function isOfficialBuild(app, options) {
  return readReleaseMetadata(app, options)?.officialBuild === true;
}

function getDistribution(app, options) {
  const distribution = readReleaseMetadata(app, options)?.distribution;
  return distribution === 'upstream-official' ||
    distribution === 'abu-project-management' ||
    distribution === 'source'
    ? distribution
    : 'source';
}

function canUseUpstreamUpdater(app, options) {
  return isOfficialBuild(app, options) && getDistribution(app, options) === 'upstream-official';
}

module.exports = {
  canUseUpstreamUpdater,
  getDistribution,
  readReleaseMetadata,
  isOfficialBuild,
  isTauriTransitionBuild,
};
