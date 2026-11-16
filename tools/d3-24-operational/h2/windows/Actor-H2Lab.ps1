param(
    [Parameter(Mandatory)][ValidateSet('verifier','closer','revoker')][string]$Role,
    [Parameter(Mandatory)][ValidateSet('pipe','revoke')][string]$Mode,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{24}$')][string]$RequestId,
    [ValidatePattern('^([a-f0-9]{24})?$')][string]$PipeId,
    [ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
    [uint32]$ControllerPid,
    [string]$OperationId,
    [switch]$BoundaryChild,
    [uint32]$LauncherPid
)
$ErrorActionPreference='Stop'
$root=(Get-Item $PSScriptRoot).Parent.FullName
$manifest=Join-Path $root 'local-manifest.json'
$config=Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json
$output=Join-Path $root "state/$Role/out-$RequestId.json"
$result=[ordered]@{role=$Role;mode=$Mode;status='FAIL';code='D336_ACTOR_ERROR'}
try {
    if (!$ManifestSha256 -or !$PipeId -or $ControllerPid -le 0 -or
        (Get-FileHash -LiteralPath $manifest).Hash -ine $ManifestSha256) { throw 'D338_SUPERVISOR_PLAN_REJECTED' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    if($identity.User.Value -ne $config.actors.$Role.sid -or @($identity.Groups|Where-Object Value -EQ 'S-1-5-32-544').Count) {throw 'D336_ACTOR_SID_REJECTED'}
    if ((& whoami.exe /priv /fo csv) -match 'SeDebugPrivilege|SeBackupPrivilege|SeRestorePrivilege|SeTakeOwnershipPrivilege|SeTcbPrivilege') {throw 'D336_ACTOR_PRIVILEGE_REJECTED'}
    $result.tokenMatch=$true
    $env:TEMP=$env:TMP=Join-Path $root "state/$Role"
    foreach($n in 'DATABASE_URL','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSFILE','NODE_OPTIONS','BYETERY_D324_FIXTURE_ADMIN_PASSWORD','BYETERY_D324_H2_ROLE_PASSWORD') {
        Remove-Item -LiteralPath "Env:$n" -ErrorAction SilentlyContinue
    }
    Add-Type -Path (Join-Path $PSScriptRoot 'H2ProcessBoundary.cs')
    if(-not $BoundaryChild) {
        $args=@('-NoLogo','-NoProfile','-NonInteractive','-File',$PSCommandPath,'-Role',$Role,'-Mode',$Mode,'-RequestId',$RequestId,
            '-BoundaryChild','-LauncherPid',[string]$PID)
        if($PipeId){$args+=@('-PipeId',$PipeId,'-ControllerPid',[string]$ControllerPid,'-ManifestSha256',$ManifestSha256)}
        if($OperationId){$args+=@('-OperationId',$OperationId)}
        $exe=Join-Path $PSScriptRoot 'pwsh/pwsh.exe'
        if(@((@($exe)+$args)|Where-Object {$_ -match '["\r\n]'}).Count){throw 'D337_UNSAFE_CREATEPROCESS_ARG'}
        $cmd=((@($exe)+$args)|ForEach-Object {'"'+$_+'"'}) -join ' '
        $baseline=[H2ProcessBoundary]::BaselineReadMask($identity.User.Value)
        @{role=$Role;baselineLogonReadMask=$baseline}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $root "state/$Role/launcher-$RequestId.json") -Encoding utf8NoBOM
        [uint32]$child=0
        $exitCode=[H2ProcessBoundary]::Launch($exe,$cmd,$root,$identity.User.Value,150000,[ref]$child)
        if(-not(Test-Path -LiteralPath $output)){throw 'D337_PROTECTED_CHILD_OUTPUT_MISSING'}
        exit $exitCode
    }
    [H2ProcessBoundary]::SetLabDescendantDefault($identity.User.Value)
    $result.processDaclVerified=$true
    $result.probePid=$PID
    $result.launcherPid=$LauncherPid
    switch($Mode) {
        'pipe' {
            if($Role -eq 'revoker'){throw 'D338_REVOKER_MODE_REQUIRED'}
            & (Join-Path $PSScriptRoot 'Invoke-H2RolePipe.ps1') -Mode Actor -Role $Role -Manifest $manifest -PipeId $PipeId -ControllerPid $ControllerPid -ManifestSha256 $ManifestSha256
        }
        'revoke' {
            if($Role -ne 'revoker'){throw 'D336_REVOKER_ROLE_REQUIRED'}
            & (Join-Path $PSScriptRoot 'Invoke-H2RolePipe.ps1') -Mode Actor -Role $Role -Manifest $manifest -PipeId $PipeId -ControllerPid $ControllerPid -ManifestSha256 $ManifestSha256 -RequestId $RequestId -OperationId $OperationId
        }
    }
    $result.status='PASS';$result.code=$null
} catch {
    $msg=$_.Exception.Message
    if($msg -match '^D33[67]_[A-Z0-9_ ]+$' -and $null -ne $result.code -and $result.code -eq 'D336_ACTOR_ERROR'){ $result.code=$msg }
    elseif($result.code -eq 'D336_ACTOR_ERROR') {
        $result.diagnostic= switch -Regex ($msg) {
            '^Peer |^Unexpected secret DACL|^Secret ACL|^Unauthorized named-pipe|^Authorized named-pipe|^Pipe token|^Negative IPC' { $msg; break }
            default {if($msg -match 'Unexpected process DACL shape|Unexpected process ACE|Unexpected process principals|Lab child timed out'){ $Matches[0] } else {'UnhandledActorError'}}
        }
    }
} finally {
    if($BoundaryChild -or -not(Test-Path -LiteralPath $output)){
        $result | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath ($output+'.tmp') -Encoding utf8NoBOM
        [IO.File]::Move($output+'.tmp',$output)
    }
}
if($result.status -ne 'PASS'){exit 1}
