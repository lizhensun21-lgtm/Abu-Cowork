import { describe, expect, it } from 'vitest';

import {
  PM_API_DEVELOPMENT_BASE_URL,
  PmApiConfigError,
  resolvePmApiBaseUrl,
} from './pmApiConfig';

describe('PM API base URL', () => {
  it('normalizes redundant trailing slashes', () => {
    expect(resolvePmApiBaseUrl({ baseUrl: ' http://localhost:8080/root/// ' }))
      .toBe('http://localhost:8080/root');
  });

  it('uses the loopback default only for development', () => {
    expect(resolvePmApiBaseUrl({ baseUrl: null, isDevelopment: true }))
      .toBe(PM_API_DEVELOPMENT_BASE_URL);
  });

  it('supports a test or deployment override', () => {
    expect(resolvePmApiBaseUrl({ baseUrl: 'https://pm.example.test/api' }))
      .toBe('https://pm.example.test/api');
  });

  it('requires an explicit production address', () => {
    expect(() => resolvePmApiBaseUrl({ baseUrl: null, isDevelopment: false }))
      .toThrow(PmApiConfigError);
  });

  it.each([
    'file:///tmp/server',
    '/relative',
    'http://user:secret@localhost:8080',
    'http://localhost:8080?mode=test',
  ])('rejects unsafe or non-HTTP base URL %s', (baseUrl) => {
    expect(() => resolvePmApiBaseUrl({ baseUrl })).toThrow(PmApiConfigError);
  });
});
