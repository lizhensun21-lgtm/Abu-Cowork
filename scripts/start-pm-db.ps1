[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'compose.yml'

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker was not found on PATH. Install/start Docker Desktop, then retry.'
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'The Docker Compose plugin is unavailable. Verify `docker compose version`.'
    }
    & docker compose -f $composeFile up -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose could not start the PostgreSQL service.'
    }
    Write-Host 'Abu PM PostgreSQL is running on 127.0.0.1:5432 (database: abu_pm_dev).'
} catch {
    Write-Error "PostgreSQL startup failed: $($_.Exception.Message)"
    exit 1
}
