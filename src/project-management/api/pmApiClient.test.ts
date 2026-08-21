import { afterEach, describe, expect, it, vi } from 'vitest';

import { PmApiClient } from './pmApiClient';
import { PmApiError } from './pmApiError';

const BASE_URL = 'http://127.0.0.1:8080';
const REQUEST_TRACE_ID = '00000000-0000-4000-8000-000000000001';
const RESPONSE_TRACE_ID = '00000000-0000-4000-8000-000000000002';

function jsonResponse(
  body: unknown,
  status = 200,
  traceId = RESPONSE_TRACE_ID,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId },
  });
}

function client(fetchMock: typeof fetch, defaultTimeoutMs = 10_000): PmApiClient {
  return new PmApiClient({
    baseUrl: BASE_URL,
    fetch: fetchMock,
    createTraceId: () => REQUEST_TRACE_ID,
    defaultTimeoutMs,
  });
}

afterEach(() => {
  vi.useRealTimers();
});
describe('PmApiClient', () => {
  it('performs a typed GET and records request/response trace IDs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));

    await expect(client(fetchMock).get<{ ok: boolean }>('/api/v1/health')).resolves.toEqual({
      data: { ok: true },
      httpStatus: 200,
      requestTraceId: REQUEST_TRACE_ID,
      responseTraceId: RESPONSE_TRACE_ID,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v1/health`);
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('X-Trace-Id')).toBe(REQUEST_TRACE_ID);
  });

  it.each([
    ['POST', 'post'],
    ['PATCH', 'patch'],
  ] as const)('sends the %s JSON contract', async (method, member) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'one' }));
    const api = client(fetchMock);

    await api[member]<{ id: string }, { value: string }>('/api/v1/fixture', { value: 'saved' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe(method);
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"value":"saved"}');
  });

  it('does not parse a DELETE 204 response body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 204,
      headers: { 'X-Trace-Id': RESPONSE_TRACE_ID },
    }));

    const response = await client(fetchMock).delete('/api/v1/fixture/one');

    expect(response.data).toBeUndefined();
    expect(response.httpStatus).toBe(204);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });

  it('parses a standard server error without changing its code namespace', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      code: 'VALIDATION_FAILED',
      message: 'Invalid request.',
      fieldErrors: [{ field: 'name', code: 'NOT_BLANK', message: 'Required.' }],
      traceId: RESPONSE_TRACE_ID,
    }, 422));

    const error = await client(fetchMock).post('/api/v1/fixture', {}).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(PmApiError);
    expect(error).toMatchObject({
      kind: 'server',
      code: 'VALIDATION_FAILED',
      httpStatus: 422,
      traceId: RESPONSE_TRACE_ID,
      requestTraceId: REQUEST_TRACE_ID,
      responseTraceId: RESPONSE_TRACE_ID,
    });
    expect((error as PmApiError).fieldErrors).toEqual([
      { field: 'name', code: 'NOT_BLANK', message: 'Required.' },
    ]);
  });

  it('treats a header/body trace mismatch as a protocol anomaly', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      code: 'INTERNAL_ERROR',
      message: 'Failed.',
      fieldErrors: [],
      traceId: 'body-trace',
    }, 500, 'header-trace'));

    await expect(client(fetchMock).get('/api/v1/fixture')).rejects.toMatchObject({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
      traceId: 'body-trace',
      responseTraceId: 'header-trace',
    });
  });

  it('falls back safely when an error body is malformed', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>failed</html>', {
      status: 503,
      headers: { 'X-Trace-Id': RESPONSE_TRACE_ID },
    }));

    await expect(client(fetchMock).get('/api/v1/fixture')).rejects.toMatchObject({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
      httpStatus: 503,
      responseTraceId: RESPONSE_TRACE_ID,
    });
  });

  it('aborts the underlying fetch on timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));
    const request = client(fetchMock, 25).get('/api/v1/health');
    const assertion = expect(request).rejects.toMatchObject({
      kind: 'timeout',
      code: 'PM_CLIENT_REQUEST_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('composes and identifies a caller AbortSignal', async () => {
    const caller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));
    const request = client(fetchMock).get('/api/v1/health', { signal: caller.signal });
    caller.abort();

    await expect(request).rejects.toMatchObject({
      kind: 'aborted',
      code: 'PM_CLIENT_REQUEST_ABORTED',
    });
  });

  it('maps a fetch failure to a client-local network error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));

    await expect(client(fetchMock).get('/api/v1/health')).rejects.toMatchObject({
      kind: 'network',
      code: 'PM_CLIENT_NETWORK_UNAVAILABLE',
    });
  });

  it('rejects invalid JSON in a successful response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', {
      status: 200,
      headers: { 'X-Trace-Id': RESPONSE_TRACE_ID },
    }));

    await expect(client(fetchMock).get('/api/v1/health')).rejects.toMatchObject({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
      httpStatus: 200,
    });
  });

  it.each(['post', 'patch', 'delete'] as const)(
    'never retries a failed %s mutation',
    async (member) => {
      const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
      const api = client(fetchMock);

      if (member === 'delete') {
        await expect(api.delete('/api/v1/fixture/one')).rejects.toBeInstanceOf(PmApiError);
      } else {
        await expect(api[member]('/api/v1/fixture', {})).rejects.toBeInstanceOf(PmApiError);
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
