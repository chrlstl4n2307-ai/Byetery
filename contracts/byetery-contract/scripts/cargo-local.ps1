param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CargoArguments)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$env:RUSTUP_HOME = Join-Path $taskRoot '.tools\rustup'
$env:CARGO_HOME = Join-Path $taskRoot '.tools\cargo'
$env:PATH = "$(Join-Path $env:CARGO_HOME 'bin');$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $env:RUSTUP_HOME 'toolchains\1.96.0-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\rust-lld.exe'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS = '-C linker-flavor=ld.lld -C link-self-contained=yes'
Push-Location $taskRoot
try {
    & (Join-Path $env:CARGO_HOME 'bin\cargo.exe') @CargoArguments
    $taskExit = $LASTEXITCODE
} finally { Pop-Location }
exit $taskExit


