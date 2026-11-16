[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Controller','Actor')][string]$Mode,
    [Parameter(Mandatory)][ValidateSet('verifier','closer','revoker')][string]$Role,
    [Parameter(Mandatory)][string]$Manifest,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{24}$')][string]$PipeId,
    [uint32]$ControllerPid = 0,
    [ValidatePattern('^[a-f0-9]{24}$')][string]$RequestId,
    [guid]$OperationId
)
$ErrorActionPreference = 'Stop'
if ((Get-FileHash -LiteralPath $Manifest).Hash -ine $ManifestSha256) { throw 'D338_MANIFEST_REJECTED' }
$lab = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json -AsHashtable
$root = (Get-Item -LiteralPath $lab.root).FullName
if ($root -cne $lab.root -or (Get-Item -LiteralPath $Manifest).FullName -cne (Join-Path $root 'local-manifest.json')) {
    throw 'D336_MANIFEST_PATH_REJECTED'
}
$actor = $lab.actors[$Role].sid
$controller = $lab.controllerSid
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$adminToken = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($actor -notmatch '^S-1-5-21-[0-9-]+$' -or $controller -notmatch '^S-1-5-21-[0-9-]+$' -or $actor -eq $controller -or
    $identity.User.Value -ne $(if($Mode -eq 'Actor') { $actor } else { $controller }) -or
    $adminToken -or ($Mode -eq 'Actor' -and @($identity.Groups | Where-Object Value -EQ 'S-1-5-32-544').Count)) {
    throw 'D336_PIPE_TOKEN_REJECTED'
}
if ($Mode -eq 'Actor' -and $ControllerPid -le 0) { throw 'D336_PIPE_CONTROLLER_PID_REQUIRED' }
$node = Join-Path $root 'bin/node.exe'
$pwsh = Join-Path $root 'bin/pwsh/pwsh.exe'
if ((Get-FileHash -LiteralPath $node).Hash -ine 'b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3' -or
    (Get-FileHash -LiteralPath $pwsh).Hash -ine '2a6769a3330dc1084d0154bfde7d164ab750ca7f700f313f9d417c1be78b2233' -or
    (Get-Process -Id $PID).Path -ine $pwsh) { throw 'D338_BOOTSTRAP_BINARY_REJECTED' }

# Reuse the reviewed native endpoint implementation. Import its type declaration only.
$probe = Join-Path $root 'bin/windows-probe.ps1'
if ((Get-FileHash -LiteralPath $probe).Hash -ine 'f3e207b83001581a1a20ea5c0840220129ef113413343f12f23e4fde4839b444') {
    throw 'D336_PIPE_PROBE_SHA_REJECTED'
}
$native = [regex]::Match((Get-Content -Raw -LiteralPath $probe), "(?s)Add-Type -TypeDefinition @'\r?\n(?<code>.*?)\r?\n'@")
if (-not $native.Success) { throw 'D336_PIPE_PROBE_SHAPE_REJECTED' }
Add-Type -TypeDefinition $native.Groups['code'].Value
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class D336PipeIdentity {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern SafePipeHandle CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    public static SafePipeHandle OpenAsync(string name, out int error) {
        // The probe's exact access and identification flags, plus overlapped I/O for duplex relay.
        var handle=CreateFile(name,0x00120183,0,IntPtr.Zero,3,0x40110000,IntPtr.Zero);
        error=handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
        return handle;
    }
}
'@

$name = "\\.\pipe\h2-d336-$PipeId-$Role"
$stop = [Threading.CancellationTokenSource]::new(90000)
$pipe = $child = $handle = $null
try {
    if ($Mode -eq 'Controller') {
        $sddl = 'D:P(A;;FA;;;'+$controller+')(A;;0x00120183;;;'+$actor+')'
        $handle = [H26Windows]::CreatePipe($name, $sddl)
        $pipe = [IO.Pipes.NamedPipeServerStream]::new([IO.Pipes.PipeDirection]::InOut,$true,$false,$handle)
        [Console]::WriteLine((@{ready=$true;role=$Role;controllerPid=$PID} | ConvertTo-Json -Compress))
        $null = $pipe.WaitForConnectionAsync($stop.Token).GetAwaiter().GetResult()
        $hello = [byte[]]::new(1)
        if ($pipe.ReadAsync($hello,0,1,$stop.Token).GetAwaiter().GetResult() -ne 1 -or $hello[0] -ne 31) {
            throw 'D336_PIPE_HELLO_REJECTED'
        }
        $seen = @{ sid = $null }
        $pipe.RunAsClient([IO.Pipes.PipeStreamImpersonationWorker]{
            $seen.sid = [Security.Principal.WindowsIdentity]::GetCurrent($true).User.Value
        })
        if ($seen.sid -ne $actor -or [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $controller) {
            throw 'D336_PIPE_PEER_SID_REJECTED'
        }
        [Console]::WriteLine((@{authenticated=$true;role=$Role} | ConvertTo-Json -Compress))
        $pipe.WriteByte(31)
        $pipe.Flush()
        $incoming = $pipe.CopyToAsync([Console]::OpenStandardOutput(),8192,$stop.Token)
        $outgoing = [Console]::OpenStandardInput().CopyToAsync($pipe,8192,$stop.Token)
        $finished = [Threading.Tasks.Task]::WhenAny([Threading.Tasks.Task[]]@($incoming,$outgoing)).GetAwaiter().GetResult()
        $null = $finished.GetAwaiter().GetResult()
    } else {
        $errno = 0
        $handle = [D336PipeIdentity]::OpenAsync($name,[ref]$errno)
        if ($errno) { throw "D336_PIPE_OPEN_REJECTED $errno" }
        [uint32]$peerPid = 0
        if (-not [D336PipeIdentity]::GetNamedPipeServerProcessId($handle,[ref]$peerPid) -or $peerPid -ne $ControllerPid) {
            throw 'D336_PIPE_SERVER_PID_REJECTED'
        }
        $pipe = [IO.Pipes.NamedPipeClientStream]::new([IO.Pipes.PipeDirection]::InOut,$true,$true,$handle)
        $pipe.WriteByte(31)
        $pipe.Flush()
        $hello = [byte[]]::new(1)
        if ($pipe.ReadAsync($hello,0,1,$stop.Token).GetAwaiter().GetResult() -ne 1 -or $hello[0] -ne 31) {
            throw 'D336_PIPE_CONTROLLER_REJECTED'
        }
        if ((Get-FileHash -LiteralPath $Manifest).Hash -ine $ManifestSha256) { throw 'D338_MANIFEST_REJECTED' }
        Add-Type -Path (Join-Path $root 'bin/H2ProcessBoundary.cs')
        [H2ProcessBoundary]::VerifyOwn($actor,$true)
        $start = [Diagnostics.ProcessStartInfo]::new($node)
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardInput = $start.RedirectStandardOutput = $start.RedirectStandardError = $true
        foreach ($key in @($start.Environment.Keys)) {
            if ($key -notmatch '^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PATHEXT|SYSTEMDRIVE|OS)$') { $null = $start.Environment.Remove($key) }
        }
        if ($Role -eq 'revoker') {
            if (!$RequestId -or $OperationId -eq [guid]::Empty) { throw 'D338_REVOCATION_SCOPE_REJECTED' }
            $childArgs = @((Join-Path $root 'bin/Revoke-H2Role.mjs'),$Manifest,$RequestId,$OperationId.ToString('D'))
        } else {
            $childArgs = @((Join-Path $root 'bin/Relay-H2Role.mjs'),$Role,$Manifest)
        }
        foreach ($arg in $childArgs) { $start.ArgumentList.Add($arg) }
        $child = [Diagnostics.Process]::Start($start)
        # This first frame is written only after authenticating the kernel pipe.
        $child.StandardInput.WriteLine((@{role=$Role;manifestSha256=$ManifestSha256;pipeId=$PipeId} | ConvertTo-Json -Compress))
        $child.StandardInput.Flush()
        $discard = $child.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null,8192,$stop.Token)
        $incoming = $pipe.CopyToAsync($child.StandardInput.BaseStream,8192,$stop.Token)
        $outgoing = $child.StandardOutput.BaseStream.CopyToAsync($pipe,8192,$stop.Token)
        $finished = [Threading.Tasks.Task]::WhenAny([Threading.Tasks.Task[]]@($incoming,$outgoing)).GetAwaiter().GetResult()
        $null = $finished.GetAwaiter().GetResult()
        if ($finished -eq $outgoing -and $child.WaitForExit(3000) -and $child.ExitCode -ne 0) { throw 'D336_ROLE_CHILD_FAILED' }
    }
} finally {
    $stop.Cancel()
    if ($pipe) { $pipe.Dispose() } elseif ($handle) { $handle.Dispose() }
    if ($child) {
        if (-not $child.HasExited) { $child.Kill($true); $null = $child.WaitForExit(3000) }
        $child.Dispose()
    }
    $stop.Dispose()
}
