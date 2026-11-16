param([Parameter(Mandatory)][uint32]$ProcessId,[Parameter(Mandatory)][ValidateSet('verifier','closer','revoker')][string]$Role,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256)
$ErrorActionPreference='Stop'
$root=(Get-Item $PSScriptRoot).Parent.FullName
$manifest=Join-Path $root 'local-manifest.json'
if((Get-FileHash -LiteralPath $manifest).Hash -ine $ManifestSha256){throw 'D338_MANIFEST_REJECTED'}
$m=Get-Content -Raw -LiteralPath $manifest|ConvertFrom-Json
Add-Type -Path (Join-Path $PSScriptRoot 'H2ProcessBoundary.cs')
try {
    [H2ProcessBoundary]::VerifyDescendant($ProcessId,$m.actors.$Role.sid)
    if ((& (Join-Path $PSScriptRoot 'windows-probe.ps1') -Role $Role -Manifest $manifest -BeforeCredential) -ne 'D338_CREDENTIAL_ACL_OK') {
        throw 'D338_CREDENTIAL_ACL_REJECTED'
    }
    if((Get-FileHash -LiteralPath $manifest).Hash -ine $ManifestSha256){throw 'D338_MANIFEST_REJECTED'}
    'D337_DESCENDANT_DACL_OK'
} catch {
    try { 'D337_DESCENDANT_DACL_REJECTED '+[H2ProcessBoundary]::DescribeDescendant($ProcessId,$m.actors.$Role.sid) }
    catch { 'D337_DESCENDANT_INSPECTION_FAILED' }
    exit 1
}
