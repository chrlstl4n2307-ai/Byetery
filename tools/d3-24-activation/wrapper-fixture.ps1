#Requires -Version 7.6
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SessionControl,
    [Parameter(Mandatory)][string]$SessionControlSha256,
    [Parameter(Mandatory)][string]$CompositionSha,
    [Parameter(Mandatory)][string]$ProbeSha256
)
$ErrorActionPreference = 'Stop'
try {
    if ($env:NODE_OPTIONS -or $env:NODE_PATH -or $env:BYETERY_D324_SESSION_CONTROL_PATH -or
        $env:BYETERY_D324_SESSION_CONTROL_SHA256 -or $SessionControlSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $ProbeSha256 -cnotmatch '^[a-f0-9]{64}$' -or $CompositionSha -cnotmatch '^[a-f0-9]{40}$') { throw 'PIN' }
    $file = Get-Item -LiteralPath $SessionControl
    if ($file -isnot [IO.FileInfo] -or $file.Length -lt 1 -or $file.Length -gt 8192 -or
        ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PIN' }
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if ($digest -cne $SessionControlSha256) { throw 'PIN' }
    $pins = [Text.UTF8Encoding]::new($false, $true).GetString($bytes) | ConvertFrom-Json
    $root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    $entry = Join-Path $root 'tools/d3-24-operational/live.mjs'
    $blockedWrapper = Join-Path $root 'tools/d3-24-operational/launch.ps1'
    $probe = Join-Path $PSScriptRoot 'wrapper-probe.mjs'
    $shell = (Get-Process -Id $PID).Path
    if ($pins.schemaVersion -ne 2 -or $pins.taskId -cne 'D3-24-RUN1' -or $pins.compositionRootSha -cne $CompositionSha -or
        $pins.live.path -ine $entry -or $pins.wrapper.path -ine $blockedWrapper -or
        $pins.pwsh.path -ine $shell -or $pins.pwsh.version -cne $PSVersionTable.PSVersion.ToString() -or
        $pins.node.path -isnot [string] -or ![IO.Path]::IsPathFullyQualified($pins.node.path) -or
        $pins.node.version -cnotmatch '^v\d+\.\d+\.\d+$') { throw 'PIN' }
    $node = Get-Item -LiteralPath $pins.node.path
    if ($node -isnot [IO.FileInfo] -or $node.Name -ine 'node.exe' -or $node.FullName -cne $pins.node.path -or
        ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PIN' }
    for ($directory = $node.Directory; $null -ne $directory; $directory = $directory.Parent) {
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PIN' }
    }
    foreach ($pin in @(
        @{path=$entry; sha256=$pins.live.sha256}
        @{path=$blockedWrapper; sha256=$pins.wrapper.sha256}
        @{path=$shell; sha256=$pins.pwsh.sha256}
        @{path=$node.FullName; sha256=$pins.node.sha256}
        @{path=$probe; sha256=$ProbeSha256}
    )) {
        if ($pin.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
            (Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash -ine $pin.sha256) { throw 'PIN' }
    }
    $version = & $node.FullName --version
    if ($LASTEXITCODE -ne 0 -or $version -cne $pins.node.version) { throw 'PIN' }
    $env:BYETERY_D324_SESSION_CONTROL_PATH = $file.FullName
    $env:BYETERY_D324_SESSION_CONTROL_SHA256 = $digest
    try {
        # The only target is this fixed offline probe. The real LIVE entry remains closed.
        & $node.FullName $probe $CompositionSha
        $result = $LASTEXITCODE
    } finally {
        Remove-Item Env:BYETERY_D324_SESSION_CONTROL_PATH, Env:BYETERY_D324_SESSION_CONTROL_SHA256
    }
    exit $result
} catch {
    [Console]::WriteLine('D324_WRAPPER_FIXTURE_REJECTED')
    exit 1
}
