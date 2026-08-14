import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App Project Management Portal shell boundary', () => {
  const source = readFileSync(resolve('src/App.tsx'), 'utf8');
  const sidebarSource = readFileSync(resolve('src/components/sidebar/Sidebar.tsx'), 'utf8');

  it('switches the app layout between the Portal and Original Abu shells', () => {
    expect(source).toContain("const projectManagementPortalActive = viewMode === 'project-management'");
    expect(source).toMatch(/projectManagementPortalActive \? \(\s*<ProjectManagementPortal \/>/);
    expect(source).toMatch(/: \(\s*<>[\s\S]*?<Sidebar \/>[\s\S]*?<RightPanel \/>/);
  });

  it('keeps the global title bar and overlays outside the shell switch', () => {
    const titleBar = source.indexOf('<WindowTitleBar');
    const shellSwitch = source.indexOf('projectManagementPortalActive ?');
    const toast = source.indexOf('<ToastContainer');

    expect(titleBar).toBeGreaterThan(-1);
    expect(shellSwitch).toBeGreaterThan(titleBar);
    expect(toast).toBeGreaterThan(shellSwitch);
  });

  it('removes the duplicate Project Management entry from Original Abu Sidebar', () => {
    expect(sidebarSource).not.toContain("setViewMode('project-management')");
    expect(sidebarSource).not.toContain('t.sidebar.projectManagement');
  });
});
