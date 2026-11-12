#Requires -Version 7.6
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$VerifiedLocalReference,
    [switch]$Integrated
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$reference = (Resolve-Path -LiteralPath $VerifiedLocalReference).Path
$baseline = '436061d6381fccb52e94ae57123c31803ede30e2'
if ($root -ieq $reference) { throw 'Use a separate verified worktree' }
$referenceHead = & git -C $reference rev-parse HEAD
if ($LASTEXITCODE -or $referenceHead -cne $baseline -or (& git -C $reference status --porcelain)) {
    throw 'Reference must be the clean verified baseline'
}

function Confirm-Ignored([string]$RelativePath) {
    & git -C $root check-ignore -q --no-index -- $RelativePath
    if ($LASTEXITCODE) { throw "Refusing to prepare a tracked path: $RelativePath" }
}

function Link-LocalDependency([string]$RelativePath) {
    Confirm-Ignored "$RelativePath/"
    $dest = Join-Path $root $RelativePath
    if (Test-Path -LiteralPath $dest) { return }
    $source = Get-Item -LiteralPath (Join-Path $reference $RelativePath)
    $target = if ($source.Target) { $source.Target } else { $source.FullName }
    if (!(Test-Path -LiteralPath $target -PathType Container)) { throw 'Verified local dependency is missing' }
    New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
    New-Item -ItemType Junction -Path $dest -Target $target | Out-Null
}

function Copy-LocalCache([string]$RelativePath) {
    Confirm-Ignored "$RelativePath/"
    $dest = Join-Path $root $RelativePath
    $source = Join-Path $reference $RelativePath
    if (!(Test-Path -LiteralPath $source -PathType Container)) { throw 'Verified local cache is missing' }
    New-Item -ItemType Directory -Force $dest | Out-Null
    & robocopy $source $dest /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'Local cache copy failed' }
}

foreach ($item in @('backend/node_modules','frontend/node_modules','tools/wallet-link/node_modules',
        '.tools/d2-008b3_1/pgsql','.tools/d2-gap2b/pgsql')) {
    Link-LocalDependency $item
}
foreach ($item in @('.tools/tmp','.tools/d3-9c')) {
    Confirm-Ignored "$item/"
    New-Item -ItemType Directory -Force (Join-Path $root $item) | Out-Null
}
if ($Integrated) {
    # Copy the toolchain and dependency cache only. Cargo credentials, .env,
    # private evidence and existing PostgreSQL data stay in the reference.
    foreach ($item in @('contracts/byetery-contract/.tools/cargo/bin',
            'contracts/byetery-contract/.tools/cargo/registry','contracts/byetery-contract/.tools/rustup/toolchains')) {
        Copy-LocalCache $item
    }
    Confirm-Ignored 'contracts/byetery-contract/.tools/rustup/settings.toml'
    $settings = 'contracts/byetery-contract/.tools/rustup/settings.toml'
    $destination = Join-Path $root $settings
    if (!(Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath (Join-Path $reference $settings) -Destination $destination }
    $data = Join-Path $root '.tools/d2-gap2b/pgdata'
    if (!(Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
        Confirm-Ignored '.tools/d2-gap2b/pgdata/'
        Push-Location $root
        try {
            @'
import ctypes
from pathlib import Path
import subprocess

def short(path):
    buf = ctypes.create_unicode_buffer(4096)
    if not ctypes.windll.kernel32.GetShortPathNameW(str(path), buf, len(buf)):
        raise RuntimeError("ShortPathUnavailable")
    return Path(buf.value)

root = Path.cwd().resolve()
base = root / ".tools/d2-gap2b"
bin_dir = short((root / ".tools/d2-008b3_1/pgsql/bin").resolve())
data = short(base) / "pgdata"
subprocess.run([str(bin_dir / "initdb.exe"), "-D", str(data), "-U", "byetery_disposable_baseline",
                "-A", "trust", "-E", "UTF8", "--locale=C"], check=True)
'@ | python -
            if ($LASTEXITCODE) { throw 'Local fixture initialization failed' }
        } finally { Pop-Location }
    }
}
'LOCAL_OFFLINE_SETUP_READY'
