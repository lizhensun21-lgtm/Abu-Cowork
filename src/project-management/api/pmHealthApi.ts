import type { PmApiRequestOptions } from './pmApiClient';
import { PmApiClient } from './pmApiClient';
import { PmApiError } from './pmApiError';
import { PM_HEALTH_TIMEOUT_MS } from './pmApiConfig';

export type PmHealthStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface PmHealthResponse {
  readonly status: PmHealthStatus;
  readonly database: PmHealthStatus;
  readonly version: string;
}
export interface PmHealthApi {
  getHealth(options?: PmApiRequestOptions): Promise<PmHealthResponse>;
}

function isHealthStatus(value: unknown): value is PmHealthStatus {
  return value === 'UP' || value === 'DEGRADED' || value === 'DOWN';
}

export function isPmHealthResponse(value: unknown): value is PmHealthResponse {
  if (!value || typeof value !== 'object') return false;
  const health = value as Record<string, unknown>;
  return isHealthStatus(health.status)
    && isHealthStatus(health.database)
    && typeof health.version === 'string'
    && health.version.length > 0;
}

export function createPmHealthApi(client = new PmApiClient()): PmHealthApi {
  return {
    async getHealth(options = {}) {
      const response = await client.get<unknown>('/api/v1/health', {
        ...options,
        timeoutMs: options.timeoutMs ?? PM_HEALTH_TIMEOUT_MS,
      });
      if (!isPmHealthResponse(response.data)) {
        throw new PmApiError({
          kind: 'protocol',
          code: 'PM_CLIENT_PROTOCOL_ERROR',
          message: 'PM Server health response does not match the expected contract.',
          httpStatus: response.httpStatus,
          requestTraceId: response.requestTraceId,
          responseTraceId: response.responseTraceId,
        });
      }
      return response.data;
    },
  };
}
