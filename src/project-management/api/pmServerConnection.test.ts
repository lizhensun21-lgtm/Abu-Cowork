import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createEmptyProjectGraph } from '../domain/projectGraph';
import { InMemoryProjectManagementRepository } from '../repository/InMemoryProjectManagementRepository';
import { createProjectManagementStore } from '../state/projectManagementStore';
import type { PmHealthApi, PmHealthResponse } from './pmHealthApi';
import { PmApiConfigError } from './pmApiConfig';
import { PmApiError } from './pmApiError';
import {
  createPmConnectionForDataMode,
  createPmServerConnection,
} from './pmServerConnection';

const NOW = new Date('2026-08-21T08:00:00.000Z');

function healthApi(implementation: PmHealthApi['getHealth']): PmHealthApi {
  return { getHealth: vi.fn(implementation) };
}

describe('PM Server connection state', () => {
  it('keeps Local JSON standalone without constructing or probing a server dependency', async () => {
    const getHealth = vi.fn<PmHealthApi['getHealth']>();
    const connection = createPmConnectionForDataMode('local-json', {
      healthApi: { getHealth },
      apiClientOptions: { baseUrl: null, isDevelopment: false },
    });

    expect(connection.getState()).toMatchObject({
      status: 'disabled',
      lastCheckedAt: null,
      serverVersion: null,
      databaseStatus: null,
      lastError: null,
    });
    await expect(connection.refresh()).resolves.toMatchObject({ status: 'disabled' });
    expect(getHealth).not.toHaveBeenCalled();
  });

  it('keeps the Server runtime probe with a valid explicit base URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      status: 'UP', database: 'UP', version: '0.1.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const connection = createPmConnectionForDataMode('server', {
      apiClientOptions: {
        baseUrl: 'https://pm.example.test',
        isDevelopment: false,
        fetch: fetchMock,
        createTraceId: () => 'preview-server-probe',
      },
      now: () => NOW,
    });

    await connection.refresh();

    expect(connection.getState()).toMatchObject({
      status: 'connected',
      serverVersion: '0.1.0',
      databaseStatus: 'UP',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://pm.example.test/api/v1/health');
  });

  it('fails clearly when Server mode has no production base URL', () => {
    expect(() => createPmConnectionForDataMode('server', {
      apiClientOptions: { baseUrl: null, isDevelopment: false },
    })).toThrow(PmApiConfigError);
  });

  it('starts unknown, exposes checking, then becomes connected for UP/UP', async () => {
    let finish: ((health: PmHealthResponse) => void) | undefined;
    const connection = createPmServerConnection({
      healthApi: healthApi(() => new Promise((resolve) => { finish = resolve; })),
      now: () => NOW,
    });
    expect(connection.getState().status).toBe('unknown');

    const refresh = connection.refresh();
    expect(connection.getState().status).toBe('checking');
    finish?.({ status: 'UP', database: 'UP', version: '0.1.0' });
    await refresh;

    expect(connection.getState()).toMatchObject({
      status: 'connected',
      lastCheckedAt: NOW.toISOString(),
      serverVersion: '0.1.0',
      databaseStatus: 'UP',
      lastError: null,
    });
  });

  it.each([
    { status: 'DEGRADED', database: 'UP', version: '0.1.0' },
    { status: 'UP', database: 'DOWN', version: '0.1.0' },
  ] as const)('maps $status/$database to degraded', async (health) => {
    const connection = createPmServerConnection({
      healthApi: healthApi(async () => health),
      now: () => NOW,
    });

    await connection.refresh();

    expect(connection.getState().status).toBe('degraded');
    expect(connection.getState().databaseStatus).toBe(health.database);
  });

  it.each([
    new PmApiError({
      kind: 'network', code: 'PM_CLIENT_NETWORK_UNAVAILABLE', message: 'offline',
    }),
    new PmApiError({
      kind: 'timeout', code: 'PM_CLIENT_REQUEST_TIMEOUT', message: 'timeout',
    }),
    new PmApiError({
      kind: 'protocol', code: 'PM_CLIENT_PROTOCOL_ERROR', message: 'malformed',
    }),
  ])('maps %s to unavailable', async (failure) => {
    const connection = createPmServerConnection({
      healthApi: healthApi(async () => { throw failure; }),
      now: () => NOW,
    });

    await connection.refresh();

    expect(connection.getState()).toMatchObject({
      status: 'unavailable',
      lastCheckedAt: NOW.toISOString(),
      lastError: failure,
    });
  });

  it('refreshes an unavailable state back to connected', async () => {
    const getHealth = vi.fn<PmHealthApi['getHealth']>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ status: 'UP', database: 'UP', version: '0.1.1' });
    const connection = createPmServerConnection({ healthApi: { getHealth }, now: () => NOW });

    await connection.refresh();
    expect(connection.getState().status).toBe('unavailable');
    await connection.refresh();

    expect(connection.getState()).toMatchObject({
      status: 'connected',
      serverVersion: '0.1.1',
      lastError: null,
    });
  });

  it('does not let a stale response overwrite a newer probe', async () => {
    const pending: Array<(health: PmHealthResponse) => void> = [];
    const connection = createPmServerConnection({
      healthApi: healthApi(() => new Promise((resolve) => pending.push(resolve))),
      now: () => NOW,
    });

    const first = connection.refresh();
    const second = connection.refresh();
    pending[1]({ status: 'UP', database: 'UP', version: 'new' });
    await second;
    pending[0]({ status: 'DEGRADED', database: 'DOWN', version: 'old' });
    await first;

    expect(connection.getState()).toMatchObject({ status: 'connected', serverVersion: 'new' });
  });

  it('does not update state after dispose/unmount', async () => {
    let finish: ((health: PmHealthResponse) => void) | undefined;
    const connection = createPmServerConnection({
      healthApi: healthApi(() => new Promise((resolve) => { finish = resolve; })),
    });
    const refresh = connection.refresh();
    const beforeDispose = connection.getState();

    connection.dispose();
    finish?.({ status: 'UP', database: 'UP', version: 'late' });
    await refresh;

    expect(connection.getState()).toBe(beforeDispose);
  });

  it('never mutates ProjectGraph or writes through the JSON repository boundary', async () => {
    const projectStore = createProjectManagementStore(
      new InMemoryProjectManagementRepository(createEmptyProjectGraph()),
    );
    await projectStore.initialize();
    const graphBeforeProbe = projectStore.getState().graph;
    const connection = createPmServerConnection({
      healthApi: healthApi(async () => {
        throw new PmApiError({
          kind: 'network', code: 'PM_CLIENT_NETWORK_UNAVAILABLE', message: 'offline',
        });
      }),
    });

    await connection.refresh();
    expect(projectStore.getState().graph).toBe(graphBeforeProbe);
    expect(projectStore.getState().graph).toEqual(createEmptyProjectGraph());

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await projectStore.commitGraph((graph) => graph);

    expect(projectStore.getState().graph).toEqual(createEmptyProjectGraph());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps the runtime repository explicitly JSON-backed with no server cutover', () => {
    const source = readFileSync(
      resolve('src/project-management/state/projectManagementStore.ts'),
      'utf8',
    );

    expect(source).toContain('new JsonProjectManagementRepository()');
    expect(source).not.toContain('ServerProjectManagementRepository');
    expect(source).not.toMatch(/fetch\(|\/api\/v1\/projects/);
  });
});
