#Requires -Version 7.6
[CmdletBinding()]
param([string]$OfflineFixture)

$ErrorActionPreference = 'Stop'
$offline = $PSBoundParameters.ContainsKey('OfflineFixture')
$nodeSha256 = 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3'
$pwshSha256 = '2a6769a3330dc1084d0154bfde7d164ab750ca7f700f313f9d417c1be78b2233'

try {
    if ($env:NODE_OPTIONS -or $env:NODE_PATH -or $PSVersionTable.PSVersion.ToString() -cne '7.6.9') { throw 'PIN' }
    $shell = (Get-Process -Id $PID).Path
    $nodePath = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $node = Get-Item -LiteralPath $nodePath
    if ($node -isnot [IO.FileInfo] -or $node.Name -ine 'node.exe' -or
        ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PIN' }
    for ($dir = $node.Directory; $null -ne $dir; $dir = $dir.Parent) {
        if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PIN' }
    }
    if ((Get-FileHash -LiteralPath $shell -Algorithm SHA256).Hash -ine $pwshSha256 -or
        (Get-FileHash -LiteralPath $node.FullName -Algorithm SHA256).Hash -ine $nodeSha256) { throw 'PIN' }
    $entry = Join-Path $PSScriptRoot 'entry-bootstrap.mjs'
    if ((Get-FileHash -LiteralPath $entry -Algorithm SHA256).Hash -ine 'b3e5f8d64713ab79a826649f8177020e02d4aa8f034c8bb50eba868d7403a179') { throw 'PIN' }
    if ($offline) {
        if ([string]::IsNullOrEmpty($OfflineFixture)) { throw 'FIXTURE' }
        & $node.FullName $entry --offline-wrapper-check $OfflineFixture
    } else {
        & $node.FullName $entry --live --task-id D3-24-RUN1 --expected-sha c50e4eb1f7f538a231c5ecfc31d19283998dc234
    }
    exit $LASTEXITCODE
} catch {
    [Console]::WriteLine('D324_BOOTSTRAP_PINS_REJECTED')
    exit 1
}
