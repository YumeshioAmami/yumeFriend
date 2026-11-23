param(
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $root "desktop"
$backend = Join-Path $desktop "backend"
$coreJar = Join-Path $desktop "resources\yumeCoreHost.jar"

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Command not found: $name"
    }
}

function Find-Uv {
    $command = Get-Command uv -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @(
        (Join-Path $env:APPDATA "Python\Python312\Scripts\uv.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\Scripts\uv.exe"),
        (Join-Path $env:USERPROFILE ".local\bin\uv.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Assert-Port-Free($port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        throw "Port $port is already in use. Close yumeFriend first."
    }
}

Require-Command "node"
Require-Command "npm"

if (-not (Test-Path -LiteralPath (Join-Path $desktop "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    Push-Location $desktop
    try { npm install } finally { Pop-Location }
}

if (-not (Test-Path -LiteralPath (Join-Path $backend ".venv"))) {
    $uv = Find-Uv
    if (-not $uv) { throw "uv not found. Install uv or create desktop/backend/.venv." }
    Write-Host "Installing Python dependencies..."
    Push-Location $backend
    try { & $uv sync --dev } finally { Pop-Location }
}

if ($Rebuild -or -not (Test-Path -LiteralPath $coreJar)) {
    Write-Host "Building yumeCore host..."
    Push-Location $desktop
    try { npm run prepare:core } finally { Pop-Location }
}

Write-Host "Building frontend..."
Push-Location $desktop
try {
    npm run build
} finally {
    Pop-Location
}

Assert-Port-Free 47895
Assert-Port-Free 47891

Write-Host "Starting yumeFriend..."
Push-Location $desktop
try {
    npm start
} finally {
    Pop-Location
}
