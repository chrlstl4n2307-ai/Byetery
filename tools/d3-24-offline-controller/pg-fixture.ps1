param([Parameter(Mandatory)][string]$Bin,[switch]$Backend,[switch]$RuntimeV3,[string[]]$Cases)
$ErrorActionPreference = 'Stop'
if (($RuntimeV3 -and $Backend) -or ($Cases -and -not $RuntimeV3)) { throw 'OfflinePostgresModeRejected' }
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$out = Join-Path $root '.test-output'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$fixture = Join-Path $out ('pg-d324-controller-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class OfflinePgPath {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint GetShortPathName(string longPath, StringBuilder shortPath, uint capacity);
}
'@
$short = [Text.StringBuilder]::new(4096)
if ([OfflinePgPath]::GetShortPathName($fixture, $short, 4096) -eq 0) { throw 'OfflinePostgresShortPathUnavailable' }
$cluster = Join-Path $short.ToString() 'data'
$config = $null
if ($Backend) {
    $compat = Join-Path $root '.tools/d2-gap2b'
    New-Item -ItemType Directory -Force -Path $compat | Out-Null
    $config = Join-Path $compat 'postgres-test.json'
    $data = Join-Path $compat 'pgdata'
    if ((Test-Path -LiteralPath $config) -or (Test-Path -LiteralPath $data)) { throw 'OfflinePgFixtureAlreadyExists' }
    New-Item -ItemType Directory -Path $data | Out-Null
    $shortData = [Text.StringBuilder]::new(4096)
    if ([OfflinePgPath]::GetShortPathName($data, $shortData, 4096) -eq 0) { throw 'OfflinePostgresShortPathUnavailable' }
    $cluster = $shortData.ToString()
}
$longBin = (Resolve-Path -LiteralPath $Bin).Path
$shortBin = [Text.StringBuilder]::new(4096)
if ([OfflinePgPath]::GetShortPathName($longBin, $shortBin, 4096) -eq 0) { throw 'OfflinePostgresShortPathUnavailable' }
$bin = $shortBin.ToString()
$pgctl = Join-Path $bin 'pg_ctl.exe'
$loop = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$loop.Start()
$port = $loop.LocalEndpoint.Port
$loop.Stop()
if ($port -lt 49152) { throw 'HighLoopbackPortRequired' }
# Isolated trust-auth cluster. It contains no non-fixture credentials or data.
foreach ($n in @('PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLMODE','PGPASSFILE','NODE_OPTIONS')) {
    Remove-Item -LiteralPath "Env:$n" -ErrorAction SilentlyContinue
}
$initLog = Join-Path $fixture 'initdb.log'
& (Join-Path $bin 'initdb.exe') -D $cluster -U byetery_d324_fixture -A trust --no-locale -E UTF8 *> $initLog
if ($LASTEXITCODE -ne 0) { throw 'OfflinePostgresInitFailed' }
$started = $false
$configWritten = $false
try {
    $start = Start-Process -FilePath $pgctl -ArgumentList @('-D',$cluster,'-l',(Join-Path $cluster 'fixture.log'),'-o',"`"-h 127.0.0.1 -p $port`"",'-w','start') -PassThru -WindowStyle Hidden
    if (-not $start.WaitForExit(20000) -or $start.ExitCode -ne 0) { throw 'OfflinePostgresStartFailed' }
    $started = $true
    $env:BYETERY_D324_TEST_PG_PORT = [string]$port
    if ($Backend) {
        @'
CREATE ROLE postgres LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
CREATE ROLE byetery_gap2b LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT pg_monitor, pg_signal_backend TO postgres, byetery_gap2b;
GRANT anon, authenticated, service_role TO postgres, byetery_gap2b WITH ADMIN TRUE;
'@ | & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U byetery_d324_fixture -d postgres *> (Join-Path $fixture 'bootstrap.log')
        if ($LASTEXITCODE -ne 0) { throw 'OfflinePostgresRoleSetupFailed' }
        @{host='127.0.0.1';port=$port;user='byetery_gap2b';database='postgres';reviewUser='postgres'} |
            ConvertTo-Json | Set-Content -Encoding utf8NoBOM -LiteralPath $config
        $configWritten = $true
    }
    Push-Location $root
    try {
        if ($Backend) {
            & npm --prefix backend run verify
            if ($LASTEXITCODE -ne 0) { throw 'OfflineBackendVerifyFailed' }
        } elseif ($RuntimeV3) {
            & node --experimental-strip-types tools/d3-24-offline-controller/run-offline.mjs --runtime-v3-review @Cases
            if ($LASTEXITCODE -ne 0) { throw 'OfflineRuntimeV3Failed' }
        } else {
            & node --experimental-strip-types --test tools/d3-24-operational/postgres.test.mjs
            if ($LASTEXITCODE -ne 0) { throw 'OfflinePostgresCoordinationFailed' }
            & node --experimental-strip-types --test --test-name-pattern='PostgreSQL protects both sides|H1 real|PostgreSQL clock' backend/tests/d324-authority.test.ts
            if ($LASTEXITCODE -ne 0) { throw 'OfflinePostgresAuthorityFailed' }
        }
    } finally { Pop-Location }
} finally {
    if ($configWritten) { Remove-Item -LiteralPath $config }
    if ($started) {
        & $pgctl -D $cluster -m fast -w stop 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'OfflinePostgresStopFailed' }
        Write-Output 'OFFLINE_POSTGRES_STOPPED'
    }
    Remove-Item Env:BYETERY_D324_TEST_PG_PORT -ErrorAction SilentlyContinue
}
