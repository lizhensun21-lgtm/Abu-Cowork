import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('Project Management Portal startup mode', () => {
  it('uses project-management as the non-persisted initial view', () => {
    expect(useSettingsStore.getInitialState().viewMode).toBe('project-management');
  });

  it('resets rehydrated ephemeral navigation to the Portal', () => {
    const source = readFileSync(resolve('src/stores/settingsStore.ts'), 'utf8');
    expect(source).toContain("state.viewMode = 'project-management'");
    expect(source).not.toMatch(/viewMode:\s*state\.viewMode/);
  });
});
