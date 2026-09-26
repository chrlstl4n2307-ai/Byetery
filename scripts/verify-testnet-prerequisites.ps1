$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$previousWrapper = $env:RUSTC_WRAPPER
Push-Location $repo
try {
    New-Item -ItemType Directory -Path '.tools' -Force | Out-Null
    # Cargo ignores target Rust flags for host build scripts during cross compilation.
    # Supply self-contained Windows linker libraries only to native compiler calls.
    # The WASM compiler receives its original arguments, preserving the frozen hash.
    $wrapper = Join-Path $repo '.tools\testnet-host-rustc.cmd'
    @'
@echo off
setlocal
for %%A in (%*) do if "%%~A"=="wasm32v1-none" goto wasm
%* -C linker-flavor=ld.lld -C link-self-contained=yes
exit /b %errorlevel%
:wasm
%*
exit /b %errorlevel%
'@ | Set-Content -LiteralPath $wrapper -Encoding ascii
    $env:RUSTC_WRAPPER = $wrapper
    & npm run verify
    if ($LASTEXITCODE -ne 0) { throw 'Existing verification failed' }
    & npm run verify:frontend
    if ($LASTEXITCODE -ne 0) { throw 'Frontend verification failed' }
    & node --experimental-strip-types scripts/test-foundation-parity.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local SQL verification failed' }
} finally {
    $env:RUSTC_WRAPPER = $previousWrapper
    Pop-Location
}
