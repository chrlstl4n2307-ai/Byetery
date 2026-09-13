$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$context = Join-Path $repoRoot '.tools/supabase-dev'
$refFile = Join-Path $context 'supabase/.temp/project-ref'
$expectedRef = 'aemxuqnnwfclzrwwiqfd'
if (-not (Test-Path -LiteralPath $refFile)) { throw 'Link the dedicated Byetery Dev project first. See docs/SUPABASE-DEV.md.' }
if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $expectedRef) { throw 'Refusing to run: linked project is not Byetery Dev.' }
$cli = Join-Path $repoRoot 'backend/node_modules/.bin/supabase.cmd'
$env:SUPABASE_TELEMETRY_DISABLED = '1'
$version = & $cli --version
if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne '2.117.0') { throw 'The pinned Supabase CLI 2.117.0 is required.' }
Write-Host "Remote DEV integration SQL tests: $expectedRef / postgres"
& $cli db query --linked --workdir $context --file (Join-Path $repoRoot 'database/tests/foundation-dev.sql')
if ($LASTEXITCODE -ne 0) { throw 'Supabase DEV SQL checks failed. Stop before changing application code.' }
