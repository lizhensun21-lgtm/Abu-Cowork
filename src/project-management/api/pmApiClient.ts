import { PM_API_DEFAULT_TIMEOUT_MS, resolvePmApiBaseUrl } from './pmApiConfig';
import { PmApiError, parsePmServerError } from './pmApiError';

export interface PmApiResponse<T> {
  readonly data: T;
  readonly httpStatus: number;
  readonly requestTraceId: string;
  readonly responseTraceId?: string;
}
export interface PmApiRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface PmApiClientOptions {
  readonly baseUrl?: string | null;
  readonly isDevelopment?: boolean;
  readonly fetch?: typeof fetch;
  readonly createTraceId?: () => string;
  readonly defaultTimeoutMs?: number;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function requestUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new PmApiError({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
      message: 'PM API paths must be absolute paths on the configured server.',
    });
  }
  return `${baseUrl}${path}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export class PmApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createTraceId: () => string;
  private readonly defaultTimeoutMs: number;

  constructor(options: PmApiClientOptions = {}) {
    this.baseUrl = resolvePmApiBaseUrl({
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.isDevelopment === undefined
        ? {}
        : { isDevelopment: options.isDevelopment }),
    });
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.createTraceId = options.createTraceId ?? (() => crypto.randomUUID());
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? PM_API_DEFAULT_TIMEOUT_MS;
  }

  get<T>(path: string, options?: PmApiRequestOptions): Promise<PmApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T, TBody = unknown>(
    path: string,
    body: TBody,
    options?: PmApiRequestOptions,
  ): Promise<PmApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  patch<T, TBody = unknown>(
    path: string,
    body: TBody,
    options?: PmApiRequestOptions,
  ): Promise<PmApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete(path: string, options?: PmApiRequestOptions): Promise<PmApiResponse<void>> {
    return this.request<void>('DELETE', path, undefined, options);
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    body: unknown,
    options: PmApiRequestOptions = {},
  ): Promise<PmApiResponse<T>> {
    const requestTraceId = this.createTraceId();
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const onCallerAbort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) onCallerAbort();
    else options.signal?.addEventListener('abort', onCallerAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('PM API request timed out', 'TimeoutError'));
    }, timeoutMs);

    try {
      const headers = new Headers({
        Accept: 'application/json',
        'X-Trace-Id': requestTraceId,
      });
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) {
        headers.set('Content-Type', 'application/json');
        init.body = JSON.stringify(body);
      }
      const response = await this.fetchImpl(requestUrl(this.baseUrl, path), init);
      const responseTraceId = response.headers.get('X-Trace-Id') ?? undefined;
      if (response.status === 204) {
        if (!response.ok) {
          throw this.protocolError('A non-success response used HTTP 204.', {
            httpStatus: response.status,
            requestTraceId,
            responseTraceId,
          });
        }
        return {
          data: undefined as T,
          httpStatus: response.status,
          requestTraceId,
          responseTraceId,
        };
      }

      const text = await response.text();
      const parsed = parseJson(text);
      if (response.ok) {
        if (parsed === undefined) {
          throw this.protocolError('PM Server returned invalid JSON for a successful response.', {
            httpStatus: response.status,
            requestTraceId,
            responseTraceId,
          });
        }
        return {
          data: parsed as T,
          httpStatus: response.status,
          requestTraceId,
          responseTraceId,
        };
      }

      const serverError = parsePmServerError(parsed);
      if (!serverError) {
        throw this.protocolError('PM Server returned a non-standard error response.', {
          httpStatus: response.status,
          requestTraceId,
          responseTraceId,
        });
      }
      if (responseTraceId && responseTraceId !== serverError.traceId) {
        throw this.protocolError('PM Server trace header and error body traceId do not match.', {
          httpStatus: response.status,
          requestTraceId,
          responseTraceId,
          traceId: serverError.traceId,
        });
      }
      throw new PmApiError({
        kind: 'server',
        code: serverError.code,
        message: serverError.message,
        httpStatus: response.status,
        fieldErrors: serverError.fieldErrors,
        traceId: serverError.traceId,
        requestTraceId,
        responseTraceId,
      });
    } catch (error: unknown) {
      if (error instanceof PmApiError) throw error;
      if (timedOut) {
        throw new PmApiError({
          kind: 'timeout',
          code: 'PM_CLIENT_REQUEST_TIMEOUT',
          message: `PM Server request timed out after ${timeoutMs}ms.`,
          requestTraceId,
          cause: error,
        });
      }
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new PmApiError({
          kind: 'aborted',
          code: 'PM_CLIENT_REQUEST_ABORTED',
          message: 'PM Server request was aborted.',
          requestTraceId,
          cause: error,
        });
      }
      throw new PmApiError({
        kind: 'network',
        code: 'PM_CLIENT_NETWORK_UNAVAILABLE',
        message: 'PM Server is unavailable.',
        requestTraceId,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private protocolError(
    message: string,
    details: Pick<
      ConstructorParameters<typeof PmApiError>[0],
      'httpStatus' | 'requestTraceId' | 'responseTraceId' | 'traceId'
    >,
  ): PmApiError {
    return new PmApiError({
      kind: 'protocol',
      code: 'PM_CLIENT_PROTOCOL_ERROR',
      message,
      ...details,
    });
  }
}
