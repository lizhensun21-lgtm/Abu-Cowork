import identity from '../../product-identity.json';

export type ProjectManagementDataMode = 'local-json' | 'server';

const DATA_MODE_LABELS: Readonly<Record<ProjectManagementDataMode, string>> = {
  'local-json': 'Local JSON',
  server: 'Server',
};

function parseProjectManagementDataMode(value: unknown): ProjectManagementDataMode {
  if (value === 'local-json' || value === 'server') return value;
  throw new Error(`Invalid project management data mode: ${String(value)}`);
}

export const PROJECT_MANAGEMENT_DATA_MODE = parseProjectManagementDataMode(
  identity.projectManagementDataMode,
);
export const PRODUCT_DATA_MODE_LABEL = DATA_MODE_LABELS[PROJECT_MANAGEMENT_DATA_MODE];
export const PRODUCT_IDENTITY = Object.freeze({
  ...identity,
  projectManagementDataMode: PROJECT_MANAGEMENT_DATA_MODE,
});
export const PRODUCT_DISPLAY_NAME = identity.displayName;
export const PRODUCT_VERSION = identity.productVersion;
export const PRODUCT_UPSTREAM_BASE_VERSION = identity.upstreamBaseVersion;
export const PRODUCT_DISTRIBUTION = identity.distribution;
export const PRODUCT_PROTOCOL = identity.protocol;
