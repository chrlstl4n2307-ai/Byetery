#Requires -Version 7.6
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SessionControl,
    [Parameter(Mandatory)][string]$SessionControlSha256
)
$ErrorActionPreference = 'Stop'
function Write-WrapperStop {
    try {
        $directory = [IO.Directory]::CreateTempSubdirectory('byetery-k7-fatal-')
        $path = Join-Path $directory.FullName 'fatal.json'
        $record = [ordered]@{
            schemaVersion = 1
            stage = 'SESSION_PINS_REJECTED'
            errorName = 'K7Stop'
            errorCode = 'SESSION_PINS_REJECTED'
            timestamp = [DateTimeOffset]::UtcNow.ToString('o')
            events = @()
        }
        $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Compress) + "`n")
        $stream = [IO.File]::Open($path, 'CreateNew', 'Write', 'None')
        try {
            $stream.Write($bytes)
            $stream.Flush($true)
        } finally { $stream.Dispose() }
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        [ordered]@{ fatalPath = $path; sha256 = $hash; stage = $record.stage } | ConvertTo-Json -Compress
    } catch { [Console]::Error.WriteLine('DIAGNOSTIC_PERSIST_FAILED') }
    Write-Output 'SESSION_PINS_REJECTED'
}

try {
    if ($SessionControlSha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $env:BYETERY_K7_SESSION_CONTROL_PATH -or $env:BYETERY_K7_SESSION_CONTROL_SHA256 -or
        $env:NODE_OPTIONS) { throw 'SESSION_PINS_REJECTED' }
    $manifest = Get-Item -LiteralPath $SessionControl
    if ($manifest.PSIsContainer -or $manifest.Length -lt 1 -or $manifest.Length -gt 8192 -or
        ($manifest.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'SESSION_PINS_REJECTED' }
    $bytes = [IO.File]::ReadAllBytes($manifest.FullName)
    $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if ($digest -cne $SessionControlSha256) { throw 'SESSION_PINS_REJECTED' }
    $pins = [Text.UTF8Encoding]::new($false, $true).GetString($bytes) | ConvertFrom-Json
    $live = Join-Path $PSScriptRoot 'live.mjs'
    $shell = (Get-Process -Id $PID).Path
    if ($pins.schemaVersion -ne 2 -or $pins.taskId -cnotmatch '^D3-[0-9]+-RUN1$' -or
        $pins.live.path -ine $live -or $pins.wrapper.path -ine $PSCommandPath -or
        $pins.pwsh.path -ine $shell -or $pins.pwsh.version -cne $PSVersionTable.PSVersion.ToString()) {
        throw 'SESSION_PINS_REJECTED'
    }
    $nodePath = $pins.node.path
    if ($nodePath -isnot [string] -or ![IO.Path]::IsPathFullyQualified($nodePath) -or
        [IO.Path]::GetFullPath($nodePath) -cne $nodePath -or $pins.node.version -isnot [string] -or
        $pins.node.version -cnotmatch '\Av\d+\.\d+\.\d+\z') { throw 'SESSION_PINS_REJECTED' }
    $node = Get-Item -LiteralPath $nodePath
    if ($node -isnot [IO.FileInfo] -or $node.Name -ine 'node.exe' -or $node.FullName -cne $nodePath -or
        ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'SESSION_PINS_REJECTED' }
    for ($directory = $node.Directory; $null -ne $directory; $directory = $directory.Parent) {
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'SESSION_PINS_REJECTED' }
    }
    # Windows may report different path casing. Hash the actual wrapper and
    # shell, and invoke the exact artifact paths recorded in the manifest.
    $artifacts = @(
        $pins.live
        @{ path = $PSCommandPath; sha256 = $pins.wrapper.sha256 }
        @{ path = $shell; sha256 = $pins.pwsh.sha256 }
        $pins.node
    )
    foreach ($pin in $artifacts) {
        if ($pin.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
            (Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash -ine $pin.sha256) {
            throw 'SESSION_PINS_REJECTED'
        }
    }
    $nodeVersion = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -cne $pins.node.version) { throw 'SESSION_PINS_REJECTED' }
    $env:BYETERY_K7_SESSION_CONTROL_PATH = $manifest.FullName
    $env:BYETERY_K7_SESSION_CONTROL_SHA256 = $digest
} catch {
    Write-WrapperStop
    exit 1
}

Push-Location (Join-Path $PSScriptRoot '../..')
try {
    & $nodePath $pins.live.path --live --task-id $pins.taskId --expected-sha c6ba2e837ed0f7b81373655b8106b58ecb86a8cd
    $result = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:BYETERY_K7_SESSION_CONTROL_PATH, Env:BYETERY_K7_SESSION_CONTROL_SHA256
}
exit $result
