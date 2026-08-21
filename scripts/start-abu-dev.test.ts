import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const devScript = readFileSync(resolve('scripts/start-abu-dev.ps1'), 'utf8');
const desktopScript = readFileSync(resolve('scripts/start-abu-desktop.ps1'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('Windows full development startup contract', () => {
  it('orchestrates existing scripts with bounded DB and Server readiness', () => {
    expect(devScript).toContain("'start-pm-db.ps1'");
    expect(devScript).toContain("'start-pm-server.ps1'");
    expect(devScript).toContain("'start-abu-desktop.ps1'");
    expect(devScript).toContain('$dbTimeoutSeconds = 60');
    expect(devScript).toContain('$serverTimeoutSeconds = 120');
    expect(devScript).toContain("$serverHealth.status -eq 'UP'");
    expect(devScript).toContain("$serverHealth.database -eq 'UP'");
    expect(devScript).toContain("'[Server] Reusing the healthy server on 127.0.0.1:8080.'");
    expect(devScript).not.toMatch(/taskkill|Stop-Process/i);
  });

  it('keeps Server logs observable outside the repository', () => {
    expect(devScript).toContain('[System.IO.Path]::GetTempPath()');
    expect(devScript).toContain('-RedirectStandardOutput $stdoutLog');
    expect(devScript).toContain('-RedirectStandardError $stderrLog');
  });

  it('clears ELECTRON_RUN_AS_NODE only for the child launch and restores it', () => {
    expect(desktopScript).toContain('$previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE');
    expect(desktopScript).toContain('Remove-Item Env:ELECTRON_RUN_AS_NODE');
    expect(desktopScript).toContain('$env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode');
    expect(desktopScript).not.toContain('SetEnvironmentVariable');
  });

  it('exposes the Windows npm shortcut without another orchestrator dependency', () => {
    expect(packageJson.scripts['dev:full']).toBe(
      'powershell.exe -ExecutionPolicy Bypass -File .\\scripts\\start-abu-dev.ps1',
    );
  });
});
