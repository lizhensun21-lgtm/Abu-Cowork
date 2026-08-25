#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'release-electron');
const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'product-identity.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const builder = YAML.parse(fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8'));

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

function readVersionInfo(filePath) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '$item = Get-Item -LiteralPath $env:ABU_PREVIEW_VERSION_INFO_PATH',
    '[ordered]@{ FileDescription = $item.VersionInfo.FileDescription; ' +
      'ProductName = $item.VersionInfo.ProductName; ' +
      'FileVersion = $item.VersionInfo.FileVersion; ' +
      'ProductVersion = $item.VersionInfo.ProductVersion } | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      env: { ...process.env, ABU_PREVIEW_VERSION_INFO_PATH: filePath },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `unable to read Windows VersionInfo for ${filePath}: ${result.stderr.trim()}`,
    );
  }
  return JSON.parse(result.stdout.trim());
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function verifyIdentitySource() {
  assertEqual(manifest.description, identity.displayName, 'package description');
  assertEqual(manifest.version, identity.productVersion, 'package version');
  assertEqual(builder.productName, identity.displayName, 'builder productName');
  assertEqual(builder.win.executableName, identity.executableName, 'Windows executableName');
  assertEqual(
    builder.extraMetadata.abuRelease.upstreamBaseVersion,
    identity.upstreamBaseVersion,
    'upstream base version',
  );
}

function verifyArtifact(filePath, label) {
  requireFile(filePath, label);
  const versionInfo = readVersionInfo(filePath);
  assertEqual(versionInfo.FileDescription, identity.displayName, `${label} FileDescription`);
  assertEqual(versionInfo.ProductName, identity.displayName, `${label} ProductName`);
  assertEqual(versionInfo.FileVersion, identity.productVersion, `${label} FileVersion`);
  return versionInfo;
}

try {
  if (process.platform !== 'win32') {
    throw new Error('Preview Windows package metadata verification requires Windows');
  }

  verifyIdentitySource();
  const installerPath = path.join(OUTPUT, identity.windowsArtifactName);
  const mainExecutablePath = path.join(
    OUTPUT,
    'win-unpacked',
    `${identity.executableName}.exe`,
  );
  const installerVersionInfo = verifyArtifact(installerPath, 'Installer');
  const mainExecutableVersionInfo = verifyArtifact(mainExecutablePath, 'Main executable');

  console.log(JSON.stringify({
    productVersion: identity.productVersion,
    upstreamBaseVersion: identity.upstreamBaseVersion,
    installer: {
      path: path.relative(ROOT, installerPath),
      versionInfo: installerVersionInfo,
    },
    mainExecutable: {
      path: path.relative(ROOT, mainExecutablePath),
      versionInfo: mainExecutableVersionInfo,
    },
  }, null, 2));
} catch (error) {
  console.error(
    `[preview-windows-package] verification failed: ${
      error instanceof Error ? error.stack || error.message : String(error)
    }`,
  );
  process.exit(1);
}
