$ErrorActionPreference = 'Stop'
function Invoke-CargoCheck([string[]]$Arguments) {
    & "$PSScriptRoot\cargo-local.ps1" -CargoArguments $Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falló cargo $($Arguments -join ' ')" }
}
Invoke-CargoCheck @('fmt', '--all', '--check')
Invoke-CargoCheck @('test', '--locked')
Invoke-CargoCheck @('rustc', '--locked', '--release', '--target', 'wasm32v1-none', '--crate-type', 'cdylib')
Invoke-CargoCheck @('test', '--locked', '--features', 'wasm-tests')
Invoke-CargoCheck @('clippy', '--locked', '--all-targets', '--features', 'wasm-tests', '--', '-D', 'warnings')
