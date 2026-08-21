export type PmApiErrorKind = 'server' | 'network' | 'timeout' | 'aborted' | 'protocol';

export interface PmApiFieldError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}
export interface PmServerErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly fieldErrors: readonly PmApiFieldError[];
  readonly traceId: string;
}

export interface PmApiErrorOptions {
  readonly kind: PmApiErrorKind;
  readonly code: string;
  readonly message: string;
  readonly httpStatus?: number;
  readonly fieldErrors?: readonly PmApiFieldError[];
  readonly traceId?: string;
  readonly requestTraceId?: string;
  readonly responseTraceId?: string;
  readonly cause?: unknown;
}

export class PmApiError extends Error {
  readonly kind: PmApiErrorKind;
  readonly code: string;
  readonly httpStatus?: number;
  readonly fieldErrors: readonly PmApiFieldError[];
  readonly traceId?: string;
  readonly requestTraceId?: string;
  readonly responseTraceId?: string;

  constructor(options: PmApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'PmApiError';
    this.kind = options.kind;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.fieldErrors = Object.freeze([...(options.fieldErrors ?? [])]);
    this.traceId = options.traceId;
    this.requestTraceId = options.requestTraceId;
    this.responseTraceId = options.responseTraceId;
  }
}

function isFieldError(value: unknown): value is PmApiFieldError {
  if (!value || typeof value !== 'object') return false;
  const fieldError = value as Record<string, unknown>;
  return typeof fieldError.field === 'string'
    && typeof fieldError.code === 'string'
    && typeof fieldError.message === 'string';
}

export function parsePmServerError(value: unknown): PmServerErrorResponse | null {
  if (!value || typeof value !== 'object') return null;
  const error = value as Record<string, unknown>;
  if (
    typeof error.code !== 'string'
    || typeof error.message !== 'string'
    || typeof error.traceId !== 'string'
    || !Array.isArray(error.fieldErrors)
    || !error.fieldErrors.every(isFieldError)
  ) {
    return null;
  }
  return {
    code: error.code,
    message: error.message,
    fieldErrors: error.fieldErrors,
    traceId: error.traceId,
  };
}
