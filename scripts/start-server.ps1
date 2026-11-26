param(
    [string]$Token = $env:YF_SERVER_TOKEN,
    [string]$DataDir = (Join-Path $env:USERPROFILE "yumefriend-server")
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $root "desktop\resources\yumeCoreHost.jar"
$modules = Join-Path $root "desktop\modules"

if (-not $Token) { throw "请设置 YF_SERVER_TOKEN 或传入 -Token" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

java -jar $jar `
    --db (Join-Path $DataDir "yumefriend.db") `
    --modules $modules `
    --port 47895 `
    --bind 0.0.0.0 `
    --device-id ([guid]::NewGuid().ToString()) `
    --product-id yumeFriend `
    --assets (Join-Path $DataDir "assets") `
    --server-token $Token
