$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $expected = 'c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6'
    $wasm = Join-Path $repoRoot 'contracts\byetery-contract\target\wasm32v1-none\release\byetery_contract.wasm'
    if (Test-Path -LiteralPath $wasm) {
        if ((Get-FileHash -LiteralPath $wasm).Hash.ToLowerInvariant() -ne $expected) { throw 'Existing WASM checkpoint mismatch' }
    }
    & pwsh -NoProfile -File contracts/byetery-contract/scripts/verify.ps1
    if ($LASTEXITCODE -ne 0) { throw 'Contract verification failed' }
    if ((Get-FileHash -LiteralPath $wasm).Hash.ToLowerInvariant() -ne $expected) { throw 'Rebuilt WASM checkpoint mismatch' }
    & npm --prefix backend run verify
    if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed' }
    & python -m unittest discover -s tools/python -p 'test_*.py' -v
    if ($LASTEXITCODE -ne 0) { throw 'Python verification failed' }
    & npm run demo
    if ($LASTEXITCODE -ne 0) { throw 'Mock demo failed' }
} finally { Pop-Location }
