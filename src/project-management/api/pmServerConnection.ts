import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import {
  PROJECT_MANAGEMENT_DATA_MODE,
  type ProjectManagementDataMode,
} from '@/config/productIdentity';
import { PmApiClient, type PmApiClientOptions } from './pmApiClient';
import { createPmHealthApi, type PmHealthApi } from './pmHealthApi';
import { PmApiError } from './pmApiError';

export type PmServerConnectionStatus =
  | 'unknown'
  | 'checking'
  | 'connected'
  | 'degraded'
  | 'unavailable'
  | 'disabled';

export interface PmServerConnectionState {
  readonly status: PmServerConnectionStatus;
  readonly lastCheckedAt: string | null;
  readonly serverVersion: string | null;
  readonly databaseStatus: 'UP' | 'DEGRADED' | 'DOWN' | null;
  readonly lastError: PmApiError | null;
}
export interface PmServerConnection {
  getState(): PmServerConnectionState;
  subscribe(listener: (state: PmServerConnectionState) => void): () => void;
  refresh(): Promise<PmServerConnectionState>;
  dispose(): void;
  useStore<T>(selector: (state: PmServerConnectionState) => T): T;
}

export interface CreatePmServerConnectionOptions {
  readonly healthApi?: PmHealthApi;
  readonly apiClientOptions?: PmApiClientOptions;
  readonly now?: () => Date;
}

function localConnectionError(error: unknown): PmApiError {
  return error instanceof PmApiError ? error : new PmApiError({
    kind: 'network',
    code: 'PM_CLIENT_NETWORK_UNAVAILABLE',
    message: 'PM Server is unavailable.',
    cause: error,
  });
}

export function createPmServerConnection(
  options: CreatePmServerConnectionOptions = {},
): PmServerConnection {
  const healthApi = options.healthApi
    ?? createPmHealthApi(new PmApiClient(options.apiClientOptions));
  const now = options.now ?? (() => new Date());
  const store = createStore<PmServerConnectionState>()(() => ({
    status: 'unknown',
    lastCheckedAt: null,
    serverVersion: null,
    databaseStatus: null,
    lastError: null,
  }));
  let sequence = 0;
  let disposed = false;
  let activeController: AbortController | null = null;

  const refresh = async () => {
    if (disposed) return store.getState();
    const requestSequence = ++sequence;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    store.setState({ status: 'checking', lastError: null });
    try {
      const health = await healthApi.getHealth({ signal: controller.signal });
      if (disposed || requestSequence !== sequence) return store.getState();
      store.setState({
        status: health.status === 'UP' && health.database === 'UP'
          ? 'connected'
          : 'degraded',
        lastCheckedAt: now().toISOString(),
        serverVersion: health.version,
        databaseStatus: health.database,
        lastError: null,
      });
    } catch (error: unknown) {
      if (disposed || requestSequence !== sequence) return store.getState();
      store.setState({
        status: 'unavailable',
        lastCheckedAt: now().toISOString(),
        serverVersion: null,
        databaseStatus: null,
        lastError: localConnectionError(error),
      });
    } finally {
      if (requestSequence === sequence) activeController = null;
    }
    return store.getState();
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    refresh,
    dispose: () => {
      disposed = true;
      sequence += 1;
      activeController?.abort();
      activeController = null;
    },
    useStore: <T>(selector: (state: PmServerConnectionState) => T) => (
      useStore(store, selector)
    ),
  };
}

function createDisabledPmServerConnection(): PmServerConnection {
  const state: PmServerConnectionState = {
    status: 'disabled',
    lastCheckedAt: null,
    serverVersion: null,
    databaseStatus: null,
    lastError: null,
  };
  const store = createStore<PmServerConnectionState>()(() => state);

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    refresh: async () => store.getState(),
    dispose: () => undefined,
    useStore: <T>(selector: (connectionState: PmServerConnectionState) => T) => (
      useStore(store, selector)
    ),
  };
}

export function isPmServerRuntimeEnabled(
  dataMode: ProjectManagementDataMode = PROJECT_MANAGEMENT_DATA_MODE,
): boolean {
  return dataMode === 'server';
}

export function createPmConnectionForDataMode(
  dataMode: ProjectManagementDataMode,
  options: CreatePmServerConnectionOptions = {},
): PmServerConnection {
  return isPmServerRuntimeEnabled(dataMode)
    ? createPmServerConnection(options)
    : createDisabledPmServerConnection();
}

let runtimeConnection: PmServerConnection | null = null;
let runtimeInitialized = false;

export function getPmServerConnection(): PmServerConnection {
  runtimeConnection ??= createPmConnectionForDataMode(PROJECT_MANAGEMENT_DATA_MODE);
  return runtimeConnection;
}

export function initializePmServerConnection(): Promise<PmServerConnectionState> {
  const connection = getPmServerConnection();
  if (!isPmServerRuntimeEnabled()) return Promise.resolve(connection.getState());
  if (runtimeInitialized) return Promise.resolve(connection.getState());
  runtimeInitialized = true;
  return connection.refresh();
}

export function refreshPmServerConnection(): Promise<PmServerConnectionState> {
  if (!isPmServerRuntimeEnabled()) {
    return Promise.resolve(getPmServerConnection().getState());
  }
  return getPmServerConnection().refresh();
}

export function usePmServerConnectionState<T>(
  selector: (state: PmServerConnectionState) => T,
): T {
  return getPmServerConnection().useStore(selector);
}
