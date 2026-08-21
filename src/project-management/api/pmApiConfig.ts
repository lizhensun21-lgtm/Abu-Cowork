export const PM_API_DEVELOPMENT_BASE_URL = 'http://127.0.0.1:8080';
export const PM_API_DEFAULT_TIMEOUT_MS = 10_000;
export const PM_HEALTH_TIMEOUT_MS = 3_000;

export interface ResolvePmApiBaseUrlOptions {
  readonly baseUrl?: string | null;
  readonly isDevelopment?: boolean;
}

export class PmApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PmApiConfigError';
  }
}

function configuredBaseUrl(): string | undefined {
  return import.meta.env.VITE_PM_API_BASE_URL;
}

export function resolvePmApiBaseUrl(
  options: ResolvePmApiBaseUrlOptions = {},
): string {
  const isDevelopment = options.isDevelopment ?? import.meta.env.DEV;
  const configured = Object.hasOwn(options, 'baseUrl')
    ? options.baseUrl
    : configuredBaseUrl();
  const candidate = configured
    ?? (isDevelopment ? PM_API_DEVELOPMENT_BASE_URL : undefined);
  const trimmed = candidate?.trim();
  if (!trimmed) {
    throw new PmApiConfigError(
      'PM Server base URL is not configured. Set VITE_PM_API_BASE_URL for this renderer build.',
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PmApiConfigError('PM Server base URL must be an absolute HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PmApiConfigError('PM Server base URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new PmApiConfigError(
      'PM Server base URL must not contain credentials, query parameters, or a fragment.',
    );
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '');
  url.pathname = normalizedPath;
  return url.toString().replace(/\/$/, '');
}
