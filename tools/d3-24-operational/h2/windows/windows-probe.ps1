param(
    [Parameter(Mandatory)][ValidateSet('verifier','closer','revoker')][string]$Role,
    [Parameter(Mandatory)][string]$Manifest,
    [switch]$BeforeCredential
)
$ErrorActionPreference='Stop'
$scope=Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json -AsHashtable
$actors=@('verifier','closer','revoker')
$sids=@($actors | ForEach-Object {$scope.actors[$_].sid})
if (@($sids | Select-Object -Unique).Count -ne 3 -or @($sids | Where-Object {$_ -notmatch '^S-1-(5-21|5-80)-[0-9-]+$'})) {
    throw 'Three independently provisioned SIDs required'
}
$self=[Security.Principal.WindowsIdentity]::GetCurrent()
if ($self.User.Value -ne $scope.actors[$Role].sid) { throw 'Effective SID mismatch' }
if (([Security.Principal.WindowsPrincipal]::new($self)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Probe requires a non-admin process'
}
$privileges=& whoami.exe /priv /fo csv
if ($privileges -match 'SeDebugPrivilege|SeBackupPrivilege|SeRestorePrivilege|SeTakeOwnershipPrivilege|SeTcbPrivilege') {
    throw 'Privileged token rejected'
}
foreach($var in @('PGPASSWORD','DATABASE_URL','BYETERY_D324_H2_ROLE_PASSWORD')) {
    if ([Environment]::GetEnvironmentVariable($var)) { throw 'Inherited secret rejected' }
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class H26Windows {
  [DllImport("kernel32.dll",SetLastError=true)] static extern SafeWaitHandle OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern SafePipeHandle CreateNamedPipe(
    string name,uint openMode,uint pipeMode,uint maxInstances,uint outSize,uint inSize,uint timeout,ref SA security);
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern SafeFileHandle CreateFile(
    string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(
    string sddl,uint revision,out IntPtr sd,IntPtr size);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
  [StructLayout(LayoutKind.Sequential)] struct SA { public int length; public IntPtr descriptor; public int inherit; }
  public static int ProcessRight(uint access,uint pid) {
    using (var h=OpenProcess(access,false,pid)) {return h.IsInvalid ? Marshal.GetLastWin32Error() : 0;}
  }
  public static SafePipeHandle CreatePipe(string name,string sddl) {
    IntPtr sd;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out sd,IntPtr.Zero)) throw new System.ComponentModel.Win32Exception();
    try {
      SA security=new SA{length=Marshal.SizeOf<SA>(),descriptor=sd,inherit=0};
      // DUPLEX, OVERLAPPED, FIRST_PIPE_INSTANCE, REJECT_REMOTE_CLIENTS.
      var h=CreateNamedPipe(name,0x40080003,0x8,1,1024,1024,0,ref security);
      if(h.IsInvalid) throw new System.ComponentModel.Win32Exception();
      return h;
    } finally {LocalFree(sd);}
  }
  public static SafeFileHandle OpenPipe(string name,out int error) {
    // Explicit read/write attributes and data, excluding CREATE_PIPE_INSTANCE.
    // SQOS_PRESENT|SECURITY_IDENTIFICATION prevents server impersonation beyond identity.
    var h=CreateFile(name,0x00120183,0,IntPtr.Zero,3,0x00110000,IntPtr.Zero);
    error=h.IsInvalid ? Marshal.GetLastWin32Error() : 0;
    return h;
  }
}
'@

$workingRoot=(Resolve-Path -LiteralPath $scope.root).Path
if ($BeforeCredential) {
    $safeDirectoryRights=[Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize
    foreach($dir in @($workingRoot,(Join-Path $workingRoot 'secrets'),(Join-Path $workingRoot 'bin'),(Join-Path $workingRoot 'candidate'))) {
        $acl=Get-Acl -LiteralPath $dir
        if (!$acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $scope.controllerSid) {
            throw 'Unexpected supervisor directory ownership'
        }
        $rules=$acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
        if (@($rules | Where-Object {
            $_.AccessControlType -ne 'Allow' -or
            ($_.IdentityReference.Value -ne $scope.controllerSid -and
                ($_.IdentityReference.Value -notin $sids -or ($_.FileSystemRights -band (-bnot $safeDirectoryRights))))
        }).Count) {throw 'Unexpected supervisor directory DACL'}
    }
}
function Resolve-Material([string]$Path) {
    $resolved=(Resolve-Path -LiteralPath $Path).Path
    if (-not $resolved.StartsWith($workingRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Material outside the disposable directory'
    }
    if ($BeforeCredential) {
        for($item=Get-Item -LiteralPath $resolved; $item; $item=if($item -is [IO.FileInfo]){$item.Directory}else{$item.Parent}) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Material crosses a reparse point' }
        }
    }
    $resolved
}
function Check-DeniedFile([string]$Path) {
    try {
        $stream=[IO.File]::Open((Resolve-Material $Path),[IO.FileMode]::Open,[IO.FileAccess]::Read)
        $stream.Dispose()
    } catch [UnauthorizedAccessException] { return }
    throw 'Peer secret readable'
}

$mySecret=Resolve-Material $scope.actors[$Role].secret
$acl=Get-Acl -LiteralPath $mySecret
if (-not $acl.AreAccessRulesProtected) {throw 'Secret ACL inherits permissions'}
$approved=@($self.User.Value,$scope.controllerSid)
$allow=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) |
    Where-Object {$_.AccessControlType -eq 'Allow'})
if ($allow.Count -ne 2 -or @($allow.IdentityReference.Value | Sort-Object -Unique).Count -ne 2 -or
    @($allow | Where-Object {$_.IdentityReference.Value -notin $approved}).Count) {
    throw 'Unexpected secret DACL'
}
if ($BeforeCredential) {
    $readMask = [Security.AccessControl.FileSystemRights]::Read -bor [Security.AccessControl.FileSystemRights]::Synchronize
    $own = $allow | Where-Object {$_.IdentityReference.Value -eq $self.User.Value}
    if ($mySecret -cne (Join-Path $workingRoot "secrets/$Role.txt") -or
        $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $scope.controllerSid -or
        ($own.FileSystemRights -band $readMask) -ne $readMask -or ($own.FileSystemRights -band (-bnot $readMask))) {
        throw 'Unexpected secret identity'
    }
    foreach($peer in $actors.Where({$_ -ne $Role})) {
        $expected=Join-Path $workingRoot "secrets/$peer.txt"
        if ($scope.actors[$peer].secret -cne $expected) { throw 'Unexpected peer path' }
        Check-DeniedFile $expected
    }
    'D338_CREDENTIAL_ACL_OK'
    return
}
$f=[IO.File]::OpenRead($mySecret)
try { if ($f.Length -lt 32) {throw 'Missing synthetic secret'} } finally { $f.Dispose() }
foreach($peer in $actors.Where({$_ -ne $Role})) { Check-DeniedFile $scope.actors[$peer].secret }

$myState=Resolve-Material $scope.actors[$Role].stateDirectory
$prefix=$scope.pipe
if ($prefix -notmatch '^d326-[a-f0-9]{24}$') {throw 'Invalid disposable pipe name'}
$pipe="\\.\pipe\$prefix"
$deadline=[DateTime]::UtcNow.AddSeconds(45)
$server=$null
$pending=$null
$timeout=[Threading.CancellationTokenSource]::new(45000)
try {
    if ($Role -eq 'verifier') {
        $sddl='D:P(A;;FA;;;'+$self.User.Value+')(A;;0x00120183;;;'+$scope.actors.closer.sid+')'
        $h=[H26Windows]::CreatePipe($pipe,$sddl)
        $server=[IO.Pipes.NamedPipeServerStream]::new([IO.Pipes.PipeDirection]::InOut,$true,$false,$h)
        $pending=$server.WaitForConnectionAsync($timeout.Token)
    }
    # State directory is SID-specific; peers have read-only access to its records.
    $readyPath=Join-Path $myState 'ready.json'
    $tempPath=Join-Path $myState 'ready.pending'
    Set-Content -NoNewline -LiteralPath $tempPath -Encoding utf8NoBOM -Value (
        @{role=$Role;sid=$self.User.Value;pid=$PID} | ConvertTo-Json -Compress)
    [IO.File]::Move($tempPath,$readyPath)
    foreach($peer in $actors.Where({$_ -ne $Role})) {
        $ready=Join-Path (Resolve-Material $scope.actors[$peer].stateDirectory) 'ready.json'
        while (-not (Test-Path -LiteralPath $ready)) {
            if ([DateTime]::UtcNow -ge $deadline) {throw 'Peer readiness timeout'}
            Start-Sleep -Milliseconds 50
        }
        $other=Get-Content -Raw -LiteralPath $ready | ConvertFrom-Json
        if ($other.sid -ne $scope.actors[$peer].sid -or $other.pid -eq $PID) {throw 'Peer identity mismatch'}
        # Obtain only a specific sensitive handle right. Do not read or modify memory.
        foreach($right in @(0x10,0x20,0x40,0x8)) {
            if ([H26Windows]::ProcessRight($right,[uint32]$other.pid) -ne 5) {throw 'Peer process right not denied'}
        }
    }
    Set-Content -LiteralPath (Join-Path $myState 'probes.done') -Value 'PASS' -Encoding ascii
    if ($Role -eq 'revoker') {
        $errorCode=0
        $probe=[H26Windows]::OpenPipe($pipe,[ref]$errorCode)
        $probe.Dispose()
        if ($errorCode -ne 5) {throw 'Unauthorized named-pipe access not denied'}
        Set-Content -LiteralPath (Join-Path $myState 'pipe.denied') -Value 'PASS' -Encoding ascii
    }
    if ($Role -eq 'closer') {
        $denial=Join-Path (Resolve-Material $scope.actors.revoker.stateDirectory) 'pipe.denied'
        while (-not (Test-Path -LiteralPath $denial)) {
            if ([DateTime]::UtcNow -ge $deadline) {throw 'Negative IPC control timeout'}
            Start-Sleep -Milliseconds 50
        }
        $errorCode=0
        $handle=[H26Windows]::OpenPipe($pipe,[ref]$errorCode)
        if ($errorCode) {$handle.Dispose();throw 'Authorized named-pipe access rejected'}
        $client=[IO.FileStream]::new($handle,[IO.FileAccess]::ReadWrite,128,$false)
        try {
            # False label is sent on purpose. The verifier must ignore it.
            $client.WriteByte(3)
            $client.Flush()
            if ($client.ReadByte() -ne 1) {throw 'Peer identity not confirmed'}
        } finally { $client.Dispose() }
    }
    if ($Role -eq 'verifier') {
        $pending.GetAwaiter().GetResult()
        $claimed=$server.ReadByte()
        $observed=@{sid=$null}
        $server.RunAsClient([IO.Pipes.PipeStreamImpersonationWorker]{
            $observed.sid=[Security.Principal.WindowsIdentity]::GetCurrent($true).User.Value
        })
        if ($claimed -ne 3 -or $observed.sid -ne $scope.actors.closer.sid -or
            [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $self.User.Value) {
            throw 'Pipe token did not identify closer distinct from the claimed role'
        }
        $server.WriteByte(1)
        $server.Flush()
    }
    foreach($peer in $actors) {
        $done=Join-Path (Resolve-Material $scope.actors[$peer].stateDirectory) 'probes.done'
        while(-not(Test-Path -LiteralPath $done)) {
            if([DateTime]::UtcNow -ge $deadline) {throw 'Peer process probe timeout'}
            Start-Sleep -Milliseconds 50
        }
    }
    [pscustomobject]@{Role=$Role;EffectiveSid=$self.User.Value;Files='PASS';ProcessRights='PASS';Pipe='PASS'} | ConvertTo-Json -Compress
} finally {
    if ($server) { $server.Dispose() }
    $timeout.Dispose()
}
