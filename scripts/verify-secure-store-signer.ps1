param([ValidateSet('check','test','build','fmt','clippy')][string]$Action='test')
$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$manifest=Join-Path $repoRoot 'tools\stellar-secure-store-signer\Cargo.toml'
# Existing toolchain only. Environment changes stay in this spawned shell.
$env:CARGO_HOME=Join-Path $repoRoot 'contracts\byetery-contract\.tools\cargo'
$env:RUSTUP_HOME=Join-Path $repoRoot 'contracts\byetery-contract\.tools\rustup'
Remove-Item Env:RUSTC_WRAPPER -ErrorAction SilentlyContinue
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=Join-Path $env:RUSTUP_HOME 'toolchains\1.96.0-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\rust-lld.exe'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS='-C linker-flavor=ld.lld -C link-self-contained=yes'
$env:CARGO_BUILD_JOBS='1'
# cc's documented empty CXXSTDLIB disables its automatic libstdc++ selection.
# build.rs explicitly links the matching LLVM libc++ archives for this helper.
$env:CXXSTDLIB=''
$env:PATH="$(Join-Path $env:CARGO_HOME 'bin');$(Join-Path $repoRoot 'contracts\byetery-contract\.tools\llvm-mingw-20260908-ucrt-x86_64\bin');$env:PATH"
$cargoPath=Join-Path $env:CARGO_HOME 'bin\cargo.exe'
switch ($Action) {
 'fmt' { & $cargoPath +1.96.0 fmt --manifest-path $manifest --all -- --check }
 'clippy' { & $cargoPath +1.96.0 clippy --offline --locked --manifest-path $manifest --all-targets -- -D warnings }
 default { & $cargoPath +1.96.0 $Action --offline --locked --manifest-path $manifest }
}
exit $LASTEXITCODE
