using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

public static class H2ProcessBoundary {
    const uint OwnerAndDacl = 5;
    const int FullProcess = 0x001FFFFF;
    static readonly SecurityIdentifier SystemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
    [StructLayout(LayoutKind.Sequential)] struct Attributes { public int Size; public IntPtr Descriptor; public int Inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public int Size; public string Reserved, Desktop, Title;
        public int X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
        public short Show, ReservedSize; public IntPtr Reserved2, In, Out, Err;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr handle,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessW(
        string executable,StringBuilder command,ref Attributes process,ref Attributes thread,bool inherit,uint flags,
        IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
    [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(
        string sddl,uint revision,out IntPtr descriptor,out uint length);
    [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool ConvertSecurityDescriptorToStringSecurityDescriptor(
        IntPtr descriptor,uint revision,uint components,out IntPtr text,out uint length);
    [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(IntPtr handle,uint type,uint components,
        out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(
        IntPtr descriptor,out bool present,out IntPtr dacl,out bool defaulted);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int kind,ref IntPtr acl,int bytes);

    static void Require(bool success) { if(!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static SecurityIdentifier RoleSid(string value) {
        using(var identity=WindowsIdentity.GetCurrent()) {
            var sid=new SecurityIdentifier(value);
            if(!sid.Equals(identity.User) || new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
                throw new InvalidOperationException("H2 role token rejected");
            return sid;
        }
    }
    static IntPtr ProtectedDescriptor(SecurityIdentifier role) {
        IntPtr descriptor; uint length;
        Require(ConvertStringSecurityDescriptorToSecurityDescriptor("O:"+role.Value+"D:P(A;;0x001fffff;;;"+role.Value+")(A;;0x001fffff;;;SY)",1,out descriptor,out length));
        return descriptor;
    }
    static RawSecurityDescriptor Read(IntPtr process) {
        IntPtr owner,group,dacl,sacl,descriptor,text; uint length;
        uint result=GetSecurityInfo(process,6,OwnerAndDacl,out owner,out group,out dacl,out sacl,out descriptor);
        if(result!=0) throw new Win32Exception((int)result);
        try {
            Require(ConvertSecurityDescriptorToStringSecurityDescriptor(descriptor,1,OwnerAndDacl,out text,out length));
            try { return new RawSecurityDescriptor(Marshal.PtrToStringUni(text)); }
            finally { LocalFree(text); }
        } finally { LocalFree(descriptor); }
    }
    static void Verify(IntPtr process,SecurityIdentifier role,bool protectedFlagRequired) {
        var read=Read(process);
        if(!role.Equals(read.Owner) || read.DiscretionaryAcl==null || read.DiscretionaryAcl.Count!=2 ||
            (protectedFlagRequired && !read.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected)))
            throw new InvalidOperationException("Unexpected process DACL shape");
        int ownerCount=0,systemCount=0;
        foreach(GenericAce rule in read.DiscretionaryAcl) {
            var ace=rule as CommonAce;
            if(ace==null || ace.AceQualifier!=AceQualifier.AccessAllowed || ace.AceFlags!=AceFlags.None || ace.AccessMask!=FullProcess)
                throw new InvalidOperationException("Unexpected process ACE");
            if(role.Equals(ace.SecurityIdentifier)) ownerCount++;
            if(SystemSid.Equals(ace.SecurityIdentifier)) systemCount++;
        }
        if(ownerCount!=1 || systemCount!=1) throw new InvalidOperationException("Unexpected process principals");
    }
    public static string BaselineReadMask(string sid) {
        RoleSid(sid);
        foreach(GenericAce rule in Read(GetCurrentProcess()).DiscretionaryAcl) {
            var ace=rule as CommonAce;
            if(ace!=null && ace.AceQualifier==AceQualifier.AccessAllowed && ace.SecurityIdentifier.Value.StartsWith("S-1-5-5-") && (ace.AccessMask&16)!=0)
                return "0x"+ace.AccessMask.ToString("X8");
        }
        return null;
    }
    public static uint Launch(string executable,string command,string directory,string sid,uint timeLimit,out uint pid) {
        pid=0;
        var role=RoleSid(sid);
        IntPtr descriptor=ProtectedDescriptor(role);
        var attributes=new Attributes {Size=Marshal.SizeOf<Attributes>(),Descriptor=descriptor};
        var startup=new Startup {Size=Marshal.SizeOf<Startup>()};
        ProcessInfo child=new ProcessInfo();
        bool exited=false;
        try {
            Require(CreateProcessW(executable,new StringBuilder(command),ref attributes,ref attributes,false,
                0x08000004,IntPtr.Zero,directory,ref startup,out child));
            pid=child.Pid;
            Verify(child.Process,role,true); // The worker's primary thread is still suspended here.
            Require(ResumeThread(child.Thread)!=uint.MaxValue);
            uint wait=WaitForSingleObject(child.Process,timeLimit);
            if(wait!=0) throw new InvalidOperationException("Lab child timed out");
            exited=true;
            uint result;
            Require(GetExitCodeProcess(child.Process,out result));
            return result;
        } finally {
            if(child.Process!=IntPtr.Zero) {
                if(!exited) {TerminateProcess(child.Process,1);WaitForSingleObject(child.Process,3000);}
                CloseHandle(child.Process);
            }
            if(child.Thread!=IntPtr.Zero) CloseHandle(child.Thread);
            LocalFree(descriptor);
        }
    }
    public static void SetLabDescendantDefault(string sid) {
        var role=RoleSid(sid);
        Verify(GetCurrentProcess(),role,true);
        IntPtr descriptor=ProtectedDescriptor(role),token=IntPtr.Zero,dacl;
        bool present,defaulted;
        try {
            Require(GetSecurityDescriptorDacl(descriptor,out present,out dacl,out defaulted));
            if(!present || dacl==IntPtr.Zero) throw new InvalidOperationException("Lab default DACL unavailable");
            Require(OpenProcessToken(GetCurrentProcess(),0x88,out token)); // QUERY | ADJUST_DEFAULT
            Require(SetTokenInformation(token,6,ref dacl,IntPtr.Size)); // TokenDefaultDacl for this disposable logon token.
        } finally { if(token!=IntPtr.Zero) CloseHandle(token); LocalFree(descriptor); }
    }
    public static void VerifyOwn(string sid,bool requireProtected) { Verify(GetCurrentProcess(),RoleSid(sid),requireProtected); }
    public static void VerifyDescendant(uint pid,string sid) {
        var role=RoleSid(sid);
        IntPtr proc=OpenProcess(0x00020000,false,pid); // READ_CONTROL only.
        Require(proc!=IntPtr.Zero);
        try { Verify(proc,role,false); } finally { CloseHandle(proc); }
    }
    public static string DescribeDescendant(uint pid,string sid) {
        var role=RoleSid(sid);
        IntPtr proc=OpenProcess(0x00020000,false,pid);
        Require(proc!=IntPtr.Zero);
        try {
            var sd=Read(proc);
            int count=sd.DiscretionaryAcl==null?-1:sd.DiscretionaryAcl.Count;
            int logonRead=0;
            if(sd.DiscretionaryAcl!=null) foreach(GenericAce raw in sd.DiscretionaryAcl) {
                var ace=raw as CommonAce;
                if(ace!=null && ace.AceQualifier==AceQualifier.AccessAllowed && ace.SecurityIdentifier.Value.StartsWith("S-1-5-5-") && (ace.AccessMask&16)!=0) logonRead++;
            }
            return "ownerMatch="+role.Equals(sd.Owner)+";aceCount="+count+";logonRead="+logonRead;
        } finally { CloseHandle(proc); }
    }
}
