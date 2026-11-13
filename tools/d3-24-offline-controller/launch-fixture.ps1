$ErrorActionPreference = 'Stop'
$node = $args[0]
$operatorArguments = @($args | Select-Object -Skip 1)
$runtimeV3 = $operatorArguments[0] -ceq '--runtime-v3-review'
$bridgeReview = $runtimeV3 -or $operatorArguments[0] -ceq '--bridge-review'
if ($bridgeReview -and ($env:NODE_OPTIONS -or $env:NODE_PATH)) {
    throw 'D324_BRIDGE_LAUNCHER_REJECTED'
}
$published = (Resolve-Path (Join-Path $PSScriptRoot '../d3-24-operational/launch.ps1')).Path
$shell = (Get-Process -Id $PID).Path
if ($env:OFFLINE_CAPABILITY -cnotmatch '^[a-f0-9]{64}$' -or
    (-not $runtimeV3 -and $env:OFFLINE_ORIGIN -cnotmatch '^http://127\.0\.0\.1:[0-9]+$')) {
    throw 'OFFLINE_FIXTURE_PARENT_REQUIRED'
}
if ((-not $runtimeV3 -and (Get-FileHash -LiteralPath $published).Hash -ine '3f46f03080e6ff290c7fda58e3992c3a94eb136876fa5178631c751d65f8984a') -or
    (Get-FileHash -LiteralPath $node).Hash -ine 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3' -or
    (Get-FileHash -LiteralPath $shell).Hash -ine '2a6769a3330dc1084d0154bfde7d164ab750ca7f700f313f9d417c1be78b2233') {
    throw 'OFFLINE_LAUNCHER_PIN_REJECTED'
}
$result = & $shell -NoProfile -NonInteractive -File $published
if ($LASTEXITCODE -ne 1 -or $result -cne 'D324_OPERATIONAL_RATIFICATION_REQUIRED') {
    throw 'PUBLISHED_LAUNCHER_NOT_CLOSED'
}
if ($bridgeReview) {
    $expectedHead = if ($runtimeV3) {'3ee1e4e5b5d047ccac6782459aa405a37ead983b'} else {'5dfe151fdfcfbc4afd747410eb097515d4ac9a9c'}
    $head = & git --no-replace-objects -C $PSScriptRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $head -cne $expectedHead) { throw 'D324_BRIDGE_LAUNCHER_REJECTED' }
}
if ($runtimeV3) {
    $result = & $shell -NoProfile -NonInteractive -File $published -V3Review
    if ($LASTEXITCODE -ne 0 -or $result -cne 'D324_V3_BOOTSTRAP_REVIEW_PASS') { throw 'D324_V3_BOOTSTRAP_REVIEW_REJECTED' }
    [Console]::WriteLine($result)
    exit 0
}
& $node --experimental-strip-types (Join-Path $PSScriptRoot 'client-fixture.mjs') @operatorArguments
exit $LASTEXITCODE
