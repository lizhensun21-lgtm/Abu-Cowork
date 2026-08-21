[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $repoRoot 'server'
$mavenWrapper = Join-Path $serverRoot 'mvnw.cmd'

try {
    $javaExecutable = if ($env:JAVA_HOME) {
        Join-Path $env:JAVA_HOME 'bin\java.exe'
    } else {
        (Get-Command java.exe -ErrorAction SilentlyContinue).Source
    }
    if (-not $javaExecutable -or -not (Test-Path -LiteralPath $javaExecutable)) {
        throw 'Java 21 was not found. Set JAVA_HOME or add Java 21 to PATH, then retry.'
    }
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 surfaces native stderr as ErrorRecord objects.
        # java -version writes its normal version output to stderr, so allow the
        # probe to complete and use the native process exit code as its status.
        $ErrorActionPreference = 'Continue'
        $javaVersionOutput = & $javaExecutable -version 2>&1
        $javaVersionExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $javaVersion = ($javaVersionOutput | Select-Object -First 1) -join ''
    if ($javaVersionExitCode -ne 0 -or $javaVersion -notmatch 'version\s+"21(?:[.\-+]|\")') {
        throw "Java 21 is required, but the active runtime reported: $javaVersion"
    }
    if (-not (Test-Path -LiteralPath $mavenWrapper)) {
        throw "Maven wrapper is missing: $mavenWrapper"
    }
    Push-Location $serverRoot
    try {
        & $mavenWrapper spring-boot:run '-Dspring-boot.run.profiles=dev'
        if ($LASTEXITCODE -ne 0) {
            throw "Spring Boot exited with code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error "PM server startup failed: $($_.Exception.Message)"
    exit 1
}
