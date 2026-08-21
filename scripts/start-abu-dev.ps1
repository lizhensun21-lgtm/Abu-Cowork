[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repoRoot 'compose.yml'
$dbScript = Join-Path $PSScriptRoot 'start-pm-db.ps1'
$serverScript = Join-Path $PSScriptRoot 'start-pm-server.ps1'
$desktopScript = Join-Path $PSScriptRoot 'start-abu-desktop.ps1'
$mavenWrapper = Join-Path $repoRoot 'server\mvnw.cmd'
$pmApiBaseUrl = 'http://127.0.0.1:8080'
$healthUrl = "$pmApiBaseUrl/api/v1/health"
$dbTimeoutSeconds = 60
$serverTimeoutSeconds = 120

function Invoke-NativeCheck {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $Command 2>&1
        return [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output = $output
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

function Get-PmHealth {
    try {
        return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    } catch {
        return $null
    }
}

function Test-LocalPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(500)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Get-AbuDesktopProcess {
    $repoRootPattern = [regex]::Escape($repoRoot)
    try {
        return Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -match $repoRootPattern -and
                $_.CommandLine -match 'electron[\\/]main\.cjs'
            } |
            Select-Object -First 1
    } catch {
        return $null
    }
}

try {
    foreach ($path in @($composeFile, $dbScript, $serverScript, $desktopScript, $mavenWrapper)) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "[Environment] Required repository path is missing: $path"
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
        throw '[Desktop] npm dependencies are unavailable. Run `npm run setup:electron-dev` first.'
    }
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
        throw '[DB] Docker was not found on PATH.'
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or
        -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw '[Desktop] Node.js/npm was not found on PATH.'
    }

    $dockerInfo = Invoke-NativeCheck { docker.exe info }
    if ($dockerInfo.ExitCode -ne 0) {
        throw '[DB] Docker Desktop is not running.'
    }
    $composeVersion = Invoke-NativeCheck { docker.exe compose version }
    if ($composeVersion.ExitCode -ne 0) {
        throw '[DB] The Docker Compose plugin is unavailable.'
    }

    $javaExecutable = if ($env:JAVA_HOME) {
        Join-Path $env:JAVA_HOME 'bin\java.exe'
    } else {
        (Get-Command java.exe -ErrorAction SilentlyContinue).Source
    }
    if (-not $javaExecutable -or -not (Test-Path -LiteralPath $javaExecutable)) {
        throw '[Server] Java 21 was not found.'
    }
    $javaProbe = Invoke-NativeCheck { & $javaExecutable -version }
    $javaVersion = ($javaProbe.Output | Select-Object -First 1) -join ''
    if ($javaProbe.ExitCode -ne 0 -or $javaVersion -notmatch 'version\s+"21(?:[.\-+]|\")') {
        throw "[Server] Java 21 is required, but the active runtime reported: $javaVersion"
    }

    Write-Host '[DB] Ensuring PostgreSQL is running...'
    $dbStart = Invoke-NativeCheck {
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dbScript
    }
    if ($dbStart.ExitCode -ne 0) {
        throw "[DB] PostgreSQL startup failed: $($dbStart.Output -join [Environment]::NewLine)"
    }
    $containerResult = Invoke-NativeCheck {
        docker.exe compose -f $composeFile ps -q postgres
    }
    $containerId = ($containerResult.Output | Select-Object -First 1) -join ''
    if ($containerResult.ExitCode -ne 0 -or -not $containerId) {
        throw '[DB] PostgreSQL container could not be resolved after startup.'
    }
    $dbDeadline = (Get-Date).AddSeconds($dbTimeoutSeconds)
    do {
        $healthResult = Invoke-NativeCheck {
            docker.exe inspect --format '{{.State.Health.Status}}' $containerId
        }
        $dbHealth = (($healthResult.Output | Select-Object -First 1) -join '').Trim()
        if ($healthResult.ExitCode -eq 0 -and $dbHealth -eq 'healthy') { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $dbDeadline)
    if ($dbHealth -ne 'healthy') {
        throw "[DB] PostgreSQL did not become healthy within ${dbTimeoutSeconds}s. Last state: $dbHealth"
    }
    Write-Host '[DB] PostgreSQL is healthy.'

    $serverHealth = Get-PmHealth
    $serverProcess = $null
    if ($serverHealth -and $serverHealth.status -eq 'UP' -and $serverHealth.database -eq 'UP') {
        Write-Host '[Server] Reusing the healthy server on 127.0.0.1:8080.'
    } else {
        if (Test-LocalPort -Port 8080) {
            throw '[Server] Port 8080 is occupied, but the PM health contract is not UP/UP.'
        }
        $logRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'Abu-Desktop'
        New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $stdoutLog = Join-Path $logRoot "pm-server-$timestamp.out.log"
        $stderrLog = Join-Path $logRoot "pm-server-$timestamp.err.log"
        $serverArguments = @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', "`"$serverScript`""
        )
        $serverProcess = Start-Process -FilePath 'powershell.exe' `
            -ArgumentList $serverArguments `
            -PassThru `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog
        Write-Host "[Server] Starting Spring Boot (PID $($serverProcess.Id))."
        Write-Host "[Server] stdout: $stdoutLog"
        Write-Host "[Server] stderr: $stderrLog"

        $serverDeadline = (Get-Date).AddSeconds($serverTimeoutSeconds)
        do {
            if ($serverProcess.HasExited) {
                $stderr = if (Test-Path -LiteralPath $stderrLog) {
                    (Get-Content -Tail 40 -LiteralPath $stderrLog) -join [Environment]::NewLine
                } else { '' }
                throw "[Server] Spring Boot exited before readiness. $stderr"
            }
            $serverHealth = Get-PmHealth
            if ($serverHealth -and $serverHealth.status -eq 'UP' -and $serverHealth.database -eq 'UP') {
                break
            }
            Start-Sleep -Milliseconds 750
        } while ((Get-Date) -lt $serverDeadline)
        if (-not $serverHealth -or $serverHealth.status -ne 'UP' -or $serverHealth.database -ne 'UP') {
            throw "[Server] Health did not become UP/UP within ${serverTimeoutSeconds}s."
        }
        Write-Host '[Server] Health is UP/UP.'
    }

    $desktopProcess = Get-AbuDesktopProcess
    if ($desktopProcess) {
        Write-Host "[Desktop] Abu Electron is already running (PID $($desktopProcess.ProcessId)); leaving it untouched."
        exit 0
    }

    Write-Host '[Desktop] Building the Electron renderer with the local PM Server address...'
    $previousPmApiBaseUrl = $env:VITE_PM_API_BASE_URL
    try {
        $env:VITE_PM_API_BASE_URL = $pmApiBaseUrl
        Push-Location $repoRoot
        try {
            & npm.cmd run build:electron:renderer
            if ($LASTEXITCODE -ne 0) {
                throw "[Desktop] Electron renderer build exited with code $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }

        Write-Host '[Desktop] Starting Abu Electron...'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $desktopScript
        if ($LASTEXITCODE -ne 0) {
            throw "[Desktop] Abu Electron exited with code $LASTEXITCODE."
        }
    } finally {
        if ($null -eq $previousPmApiBaseUrl) {
            Remove-Item Env:VITE_PM_API_BASE_URL -ErrorAction SilentlyContinue
        } else {
            $env:VITE_PM_API_BASE_URL = $previousPmApiBaseUrl
        }
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
