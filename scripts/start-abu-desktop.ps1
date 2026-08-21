[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

try {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm was not found on PATH. Install the repository-supported Node.js runtime, then retry.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
        throw 'node_modules is missing. Run `npm run setup:electron-dev` from the repository root first.'
    }
    Push-Location $repoRoot
    try {
        # ELECTRON_RUN_AS_NODE makes electron.exe behave as node.exe. Clear it
        # only in this script process while launching the npm/Electron child;
        # the caller and User/Machine environment are never modified.
        $previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE
        try {
            Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
            & npm.cmd run electron:dev
            if ($LASTEXITCODE -ne 0) {
                throw "Abu Desktop exited with code $LASTEXITCODE."
            }
        } finally {
            if ($null -eq $previousElectronRunAsNode) {
                Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
            } else {
                $env:ELECTRON_RUN_AS_NODE = $previousElectronRunAsNode
            }
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error "Abu Desktop startup failed: $($_.Exception.Message)"
    exit 1
}
