import { describe, expect, it, vi } from 'vitest';

import { PmApiClient } from './pmApiClient';
import { PmApiError } from './pmApiError';
import { createPmHealthApi, isPmHealthResponse } from './pmHealthApi';

describe('PM health API', () => {
  it.each([
    { status: 'UP', database: 'UP', version: '0.1.0' },
    { status: 'DEGRADED', database: 'DOWN', version: '0.1.0' },
  ])('accepts the supported runtime health shape', (health) => {
    expect(isPmHealthResponse(health)).toBe(true);
  });

  it('rejects an unknown or incomplete health shape', () => {
    expect(isPmHealthResponse({ status: 'UP', database: 'MAYBE', version: '0.1.0' })).toBe(false);
    expect(isPmHealthResponse({ status: 'UP', database: 'UP' })).toBe(false);
  });

  it('converts malformed success data into a protocol error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"UP"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const api = createPmHealthApi(new PmApiClient({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: fetchMock,
      createTraceId: () => 'request-trace',
    }));

    await expect(api.getHealth()).rejects.toMatchObject<Partial<PmApiError>>({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
    });
  });
});
