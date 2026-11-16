param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{24}$')][string]$Nonce)
$ErrorActionPreference='Stop'
$location=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'execution-location.json')|ConvertFrom-Json
$root=(Get-Item -LiteralPath $location.root).FullName
if($root -notmatch '^C:\\Users\\Public\\Documents\\ByeteryH2Lab-[a-f0-9]{24}$'){throw 'D336_RELEASE_ROOT_REJECTED'}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $root 'local-manifest.json')|ConvertFrom-Json
$controller=[Security.Principal.WindowsIdentity]::GetCurrent().User
if($manifest.controllerSid -ne $controller.Value){throw 'D336_RELEASE_ACTOR_REJECTED'}
$acl=[Security.AccessControl.FileSecurity]::new()
$acl.SetOwner($controller)
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($controller,'FullControl','Allow'))
foreach($role in 'verifier','closer','revoker'){
    $sid=[Security.Principal.SecurityIdentifier]::new($manifest.actors.$role.sid)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'Read','Allow'))
}
$file=[IO.FileInfo]::new((Join-Path $root ('release-'+$Nonce)))
$handle=[IO.FileSystemAclExtensions]::Create($file,'CreateNew','Write','Read',4096,'None',$acl)
$handle.Dispose()
