$ErrorActionPreference='Stop'
$root=(Get-Item -LiteralPath $PSScriptRoot).Parent.FullName
if($PSVersionTable.PSVersion.Major -lt 7){
    & (Join-Path $root 'bin/pwsh/pwsh.exe') -NoLogo -NoProfile -File $PSCommandPath
    return
}
$manifestPath=Join-Path $root 'local-manifest.json'
$manifestSha256=(Get-FileHash -LiteralPath $manifestPath).Hash.ToLowerInvariant()
$manifest=Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$service=Get-Service -Name seclogon
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($root -cne $manifest.root -or $identity.User.Value -ne $manifest.controllerSid -or ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'D336_NON_ELEVATED_CONTROLLER_REQUIRED'}
if($service.Status -ne 'Running'){throw 'D336_SECONDARY_LOGON_NOT_RUNNING'}
$host.UI.RawUI.WindowTitle='BYETERY V3 H2 - CUENTAS DE LABORATORIO / SIN ECO'
$accounts=[ordered]@{verifier='ByeteryH2Verifier';closer='ByeteryH2Closer';revoker='ByeteryH2Revoker'}
$credentials=@{}
$running=@{}
$queue=Join-Path $root 'controller'
$ready=Join-Path $queue 'broker-ready.json'
if(Test-Path -LiteralPath $ready){throw 'D336_BROKER_ALREADY_ACTIVE'}
function Write-JsonOnce($path,$value){
    $value|ConvertTo-Json -Compress -Depth 3|Set-Content -LiteralPath ($path+'.tmp') -Encoding utf8NoBOM
    [IO.File]::Move($path+'.tmp',$path)
}
try {
    foreach($role in $accounts.Keys){
        $name=$accounts[$role]
        $pass=Read-Host "Contraseña local existente de $name" -AsSecureString
        if($pass.Length -eq 0){$pass.Dispose();throw 'D336_BROKER_EMPTY_PASSWORD'}
        $credentials[$role]=[pscredential]::new($env:COMPUTERNAME+'\'+$name,$pass)
    }
    Write-JsonOnce $ready @{state='READY'; roles=3; pid=$PID}
    Write-Host 'D336_BROKER_READY. Mantén esta ventana abierta durante las pruebas.'
    $limit=[DateTime]::UtcNow.AddMinutes(24)
    while([DateTime]::UtcNow -lt $limit -and -not(Test-Path -LiteralPath (Join-Path $queue 'broker-stop'))){
        foreach($path in Get-ChildItem -LiteralPath $queue -File -Filter 'request-*.json'){
            if($path.Name -notmatch '^request-([a-f0-9]{24})\.json$'){continue}
            $id=$Matches[1]
            $response=Join-Path $queue ('reply-'+$id+'.json')
            if(Test-Path -LiteralPath $response){continue}
            $result=@{status='FAIL';code='D336_LAUNCH_REJECTED'}
            try {
                $req=Get-Content -Raw -LiteralPath $path.FullName|ConvertFrom-Json
                $role=$req.role
                $mode=$req.mode
                if($role -notin $accounts.Keys -or $mode -notin @('pipe','revoke') -or
                    $req.manifestSha256 -cne $manifestSha256 -or (Get-FileHash -LiteralPath $manifestPath).Hash -ine $manifestSha256 -or
                    $req.pipeId -notmatch '^[a-f0-9]{24}$' -or [uint32]$req.controllerPid -le 0){throw 'D336_BAD_REQUEST'}
                $accountSid=([Security.Principal.NTAccount]::new($env:COMPUTERNAME,$accounts[$role])).Translate([Security.Principal.SecurityIdentifier]).Value
                if($accountSid -cne $manifest.actors.$role.sid){throw 'D338_BROKER_SID_REJECTED'}
                $actor=Join-Path $root 'bin/Actor-H2Lab.ps1'
                $argList=@('-NoLogo','-NoProfile','-NonInteractive','-File',('"'+$actor+'"'),'-Role',$role,'-Mode',$mode,'-RequestId',$id,
                    '-PipeId',$req.pipeId,'-ControllerPid',[string]$req.controllerPid,'-ManifestSha256',$manifestSha256)
                if($mode -eq 'pipe') {
                    if($role -eq 'revoker'){throw 'D336_BAD_PIPE_REQUEST'}
                }
                if($mode -eq 'revoke') {
                    if($role -ne 'revoker' -or $req.operationId -notmatch '^[a-f0-9-]{36}$'){throw 'D336_BAD_REVOKE_REQUEST'}
                    $argList+=@('-OperationId',$req.operationId)
                }
                $child=Start-Process -FilePath (Join-Path $root 'bin/pwsh/pwsh.exe') -ArgumentList $argList -WorkingDirectory $root `
                    -Credential $credentials[$role] -WindowStyle Hidden -PassThru
                $running[$id]=$child
                $result=@{status='STARTED';pid=$child.Id}
            } catch {
                $e=$_.Exception
                while($e.InnerException){$e=$e.InnerException}
                $result.type=$e.GetType().Name
                if($e -is [ComponentModel.Win32Exception]){$result.win32=$e.NativeErrorCode}
            }
            Write-JsonOnce $response $result
        }
        Start-Sleep -Milliseconds 70
    }
} finally {
    foreach($child in $running.Values){
        try {if(-not $child.HasExited){$child.Kill($true);$null=$child.WaitForExit(3000)}} catch { }
        $child.Dispose()
    }
    foreach($c in $credentials.Values){$c.Password.Dispose()}
    if(Test-Path -LiteralPath $ready){Remove-Item -LiteralPath $ready}
    Write-Host 'D336_BROKER_CLOSED.'
}
