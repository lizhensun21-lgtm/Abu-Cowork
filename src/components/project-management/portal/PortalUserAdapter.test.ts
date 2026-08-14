import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adaptPortalUser } from './PortalUserAdapter';

describe('PortalUserAdapter identity boundary', () => {
  it('adapts the existing local profile without inventing a PM identity', () => {
    expect(adaptPortalUser('  Alex  ', '  data:image/png;base64,a  ', 'Me')).toEqual({
      displayName: 'Alex',
      avatarUrl: 'data:image/png;base64,a',
    });
    expect(adaptPortalUser('', '', 'Me')).toEqual({
      displayName: 'Me',
      avatarUrl: null,
    });
  });

  it('does not depend on PM Person, account persistence, or a second identity store', () => {
    const source = readFileSync(
      resolve('src/components/project-management/portal/PortalUserAdapter.ts'),
      'utf8',
    );

    expect(source).toContain("from '@/stores/settingsStore'");
    expect(source).not.toMatch(/from ['"]@\/project-management\/domain|localStorage|create\(/);
  });
});
