"""Offline-only B4.4 PREP. Existing dependencies/binaries; new test orchestration.

No .env is loaded. Builds an isolated copy, then runs the unchanged backend
launcher and all frontend tests while its ephemeral loopback PostgreSQL is up.
"""
from pathlib import Path
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.tools/d2-b44-prep'
STAGE = OUT / 'workspace/frontend'
ORIGINAL_RUN = subprocess.run


def env():
    allowed = {'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SYSTEMDRIVE',
               'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'}
    e = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    temp = OUT / 'tmp'
    temp.mkdir(exist_ok=True)
    e.update(TEMP=str(temp), TMP=str(temp), CI='1', NEXT_TELEMETRY_DISABLED='1',
             NO_UPDATE_NOTIFIER='1', npm_config_update_notifier='false',
             NODE_OPTIONS='--import=' + (ROOT / 'scripts/instaward/b44-prep-network-guard.mjs').as_uri(),
             B44_PREP_NETWORK_LOG=str(OUT / 'network-blocks.jsonl'))
    return e


def run(name, args, cwd, environment):
    started = time.monotonic()
    with (OUT / (name + '.log')).open('wb') as log:
        p = ORIGINAL_RUN(args, cwd=cwd, env=environment, stdout=log,
                         stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    r = {'command': args, 'cwd': str(cwd.relative_to(ROOT)), 'exit_code': p.returncode,
         'duration_seconds': round(time.monotonic() - started, 2),
         'log': str((OUT / (name + '.log')).relative_to(ROOT))}
    print(json.dumps({name: r}), flush=True)
    return r


def link_or_copy(src, dst):
    if os.path.exists(dst) and os.path.samefile(src, dst):
        return dst
    try:
        os.link(src, dst)
        return dst
    except OSError:
        return shutil.copy2(src, dst)


def main():
    OUT.mkdir(exist_ok=True)
    STAGE.resolve().relative_to((ROOT / '.tools').resolve())
    resume = sys.argv[1:] == ['--resume-build']
    if (STAGE / '.next').exists() and not resume:
        raise RuntimeError('BuiltStageExistsDoNotOverwrite; inspect previous run first')
    STAGE.mkdir(parents=True, exist_ok=True)
    # No ignored environment files or build outputs enter the isolated source copy.
    shutil.copytree(ROOT / 'frontend', STAGE, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('node_modules', '.next', '.env', '.env.*',
                                                 '*.tsbuildinfo', 'coverage', 'test-results'))
    # Extended paths are local Windows filesystem syntax, not a policy change.
    if not resume:
        shutil.copytree('\\\\?\\' + str(ROOT / 'frontend/node_modules'),
                        '\\\\?\\' + str(STAGE / 'node_modules'), dirs_exist_ok=True,
                        copy_function=link_or_copy, ignore=shutil.ignore_patterns('.cache'))
    elif not (STAGE / 'node_modules/next/package.json').is_file():
        raise RuntimeError('ResumeRequiresCompleteExistingDependencies')
    scripts = STAGE.parent / 'scripts/instaward'
    scripts.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'scripts/instaward/b44-prep-build-audit.mjs', scripts)
    # TypeScript includes existing tests with these public, sanitized evidence imports.
    for rel in ['docs/instaward/d2/D2-003-TIMELINE.json',
                'docs/instaward/d2/evidence/d2-007/state-read-models.json',
                'docs/instaward/d2/evidence/d2-007/historical-control.json']:
        target = STAGE.parent / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, target)
    dummy = env()
    dummy.update(BYETERY_REVIEW_ADAPTER='DIRECT_REVIEW', BYETERY_WEB_ENV='D2_PREVIEW',
                 BYETERY_SOURCE='TESTNET', BYETERY_DEPLOYMENT_ID='11111111-1111-1111-1111-111111111111',
                 BYETERY_WEB_ORIGIN='https://byetery.example.invalid',
                 BYETERY_ALLOWED_WEB_ORIGINS='["https://byetery.example.invalid"]',
                 SUPABASE_URL='https://supabase.example.invalid', SUPABASE_PUBLISHABLE_KEY='test-only',
                 VERCEL_ENV='preview', VERCEL_URL='byetery.example.invalid',
                 VERCEL_GIT_COMMIT_REF='instaward/d2-web-mvp')
    results = {'classification': 'LOCAL ONLY; NOT HOSTED_PREVIEW',
               'real_env_loaded': False, 'remote_services': False, 'build': None}
    if resume and (OUT / 'build.log').exists():
        shutil.copy2(OUT / 'build.log', OUT / ('build-prior-' + str(time.time_ns()) + '.log'))
    try:
        results['build'] = run('build', ['cmd.exe', '/d', '/c', 'npm run build'], STAGE, dummy)
        if results['build']['exit_code']:
            raise RuntimeError('LocalBuildFailed; inspect new-test typing before production')
        results['typecheck'] = run('frontend-typecheck', ['node', 'node_modules/typescript/bin/tsc',
                                 '--noEmit', '--incremental', 'false'], STAGE, dummy)
        results['audit'] = run('build-audit', ['node', '--experimental-strip-types',
             str(ROOT / 'scripts/instaward/b44-prep-build-audit.mjs'), str(STAGE), str(OUT / 'build-audit.json')], ROOT, env())
        results['existing_review_audit'] = run('existing-review-audit', ['node',
             '--experimental-strip-types', 'tools/audit-review.mjs'], STAGE, env())
        if any(results[k]['exit_code'] for k in ('typecheck', 'audit', 'existing_review_audit')):
            raise RuntimeError('LocalBuildAuditOrTypecheckFailed')
        spec = importlib.util.spec_from_file_location('existing_pg_fixture', ROOT / 'scripts/instaward/local-postgres-fixture.py')
        fixture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fixture)
        fixture.OUT = OUT / 'postgres'

        def intercepted(args, **kwargs):
            if list(map(str, args)) == ['cmd.exe', '/d', '/c', 'npm --prefix backend run verify']:
                # Deny-only instrumentation; no changes to source/tests/SQL/assertions.
                kwargs['env'] = {**env(), **{k: v for k, v in kwargs['env'].items() if k.startswith('PG')}}
                backend = ORIGINAL_RUN(args, **kwargs)
                if backend.returncode == 0:
                    fe = env()
                    fe['B44_PREP_BUILD_ROOT'] = str(STAGE)
                    results['frontend_tests'] = run('frontend-tests', ['node',
                      'frontend/node_modules/vitest/vitest.mjs', 'run', '--config',
                      'scripts/instaward/b44-prep-vitest.config.mts', '--reporter=default',
                      '--reporter=json', '--outputFile=' + str(OUT / 'frontend-tests.json')], ROOT, fe)
                return backend
            return ORIGINAL_RUN(args, **kwargs)

        subprocess.run = intercepted
        try:
            results['backend_exit_code'] = fixture.main()
        finally:
            subprocess.run = ORIGINAL_RUN
        if results['backend_exit_code'] or results.get('frontend_tests', {}).get('exit_code', 1):
            raise RuntimeError('RegressionOrNewTestFailedSTOP')
        results['pass'] = True
    except Exception as exc:
        results['pass'] = False
        results['failure'] = type(exc).__name__ + ': ' + str(exc)
        raise
    finally:
        subprocess.run = ORIGINAL_RUN
        (OUT / 'run-result.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
