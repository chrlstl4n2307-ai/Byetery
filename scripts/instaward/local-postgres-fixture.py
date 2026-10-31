"""Run the unchanged backend suite on an isolated PG17.6 NOSUPERUSER fixture.

Uses existing portable binaries only; no .env, remote URL, installation or service.
Preserves/restores the stopped legacy cluster and never changes its database roles.
Run from repository root: python scripts/instaward/local-postgres-fixture.py
"""
from pathlib import Path
import ctypes
import hashlib
import json
import os
import re
import socket
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.tools/d2-gap2b'
OUT = ROOT / '.tools/d2-fixture-preflight-2026-10-31'
BOOTSTRAP = 'byetery_fixture_bootstrap'


def checked(path):
    resolved = path.resolve()
    resolved.relative_to((ROOT / '.tools').resolve())
    if path.is_symlink():
        raise RuntimeError('UnexpectedFixtureSymlink')
    return path


def short(path):
    buf = ctypes.create_unicode_buffer(4096)
    if not ctypes.windll.kernel32.GetShortPathNameW(str(path), buf, len(buf)):
        raise RuntimeError('ShortPathUnavailable')
    return Path(buf.value)


def main():
    run_id = uuid.uuid4().hex
    OUT.mkdir(exist_ok=True)
    run = checked(OUT / ('run-' + run_id))
    run.mkdir()
    data = checked(LOCAL / 'pgdata')
    archive = checked(LOCAL / ('pgdata.legacy-' + run_id))
    retained = checked(run / 'pgdata-tested')
    config = checked(LOCAL / 'postgres-test.json')
    binary = short(ROOT / '.tools/d2-008b3_1/pgsql/bin')
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(('PG', 'SUPABASE', 'STELLAR', 'BYETERY'))
           and k not in ('NODE_OPTIONS', 'DATABASE_URL')}
    env.update(PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='5', PYTHONIOENCODING='utf-8')

    def command(args, **kwargs):
        return subprocess.run([str(x) for x in args], cwd=ROOT, env=env,
                              creationflags=subprocess.CREATE_NO_WINDOW, **kwargs)

    def capture(args, **kwargs):
        return command(args, capture_output=True, **kwargs)

    def psql(user, sql, database='postgres'):
        return capture([binary / 'psql.exe', '-X', '-v', 'ON_ERROR_STOP=1',
                        '-v', 'VERBOSITY=verbose', '-A', '-t', '-h', '127.0.0.1',
                        '-p', str(port), '-U', user, '-d', database, '-f', '-'],
                       input=sql if isinstance(sql, bytes) else sql.encode('utf-8'))

    def query(user, sql):
        result = psql(user, sql)
        if result.returncode or b'WARNING:' in result.stderr:
            raise RuntimeError('LocalReadFailedOrWarned')
        return json.loads(result.stdout.decode('utf-8').strip())

    version = capture([binary / 'postgres.exe', '--version'], text=True)
    if version.returncode or not version.stdout.strip().endswith(' 17.6'):
        raise RuntimeError('ExistingExactPostgreSQL176Required')
    if config.exists() or not (data / 'PG_VERSION').is_file():
        raise RuntimeError('StoppedLegacyFixtureAndNoActiveConfigRequired')
    status = capture([LOCAL / 'pgsql/bin/pg_ctl.exe', '-D', short(data), 'status'])
    if status.returncode != 3:
        raise RuntimeError('LegacyClusterNotConfirmedStopped')
    protected = [p for p in (ROOT / 'database').rglob('*.sql')]
    protected += [p for p in (ROOT / 'backend/tests').glob('*.test.ts')]
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in protected}
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    if port < 49152:
        raise RuntimeError('HighLoopbackPortRequired')
    result = {'run': run.name, 'SQL_test_hashes_before': hashes, 'negative': {},
              'suite': None, 'cleanup': {}, 'bootstrap_connections_closed': False}
    moved = False
    config_bytes = None
    failed = None
    exit_code = 1
    try:
        # Both resolved source/destination have been checked under this workspace's
        # ignored .tools; no recursive delete, junction or global service is used.
        data.rename(archive)
        moved = True
        with (run / 'initdb.log').open('wb') as log:
            command([binary / 'initdb.exe', '-D', short(LOCAL) / 'pgdata', '-U', BOOTSTRAP,
                     '-A', 'trust', '-E', 'UTF8', '--locale=C'], stdout=log,
                    stderr=subprocess.STDOUT, check=True)
        with (run / 'start.log').open('wb') as log:
            command([binary / 'pg_ctl.exe', '-D', short(data), '-l', short(run) / 'server.log',
                     '-o', f'-h 127.0.0.1 -p {port} -c max_connections=60 -c shared_buffers=32MB',
                     '-w', 'start'], stdout=log, stderr=subprocess.STDOUT, check=True)
        setup = """
CREATE ROLE postgres LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
CREATE ROLE byetery_gap2b LOGIN INHERIT NOSUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
GRANT pg_monitor, pg_signal_backend TO postgres, byetery_gap2b;
GRANT anon, authenticated, service_role TO postgres, byetery_gap2b WITH ADMIN TRUE;
"""
        bootstrap = psql(BOOTSTRAP, setup)
        (run / 'bootstrap.stderr').write_bytes(bootstrap.stderr)
        if bootstrap.returncode or b'WARNING:' in bootstrap.stderr:
            raise RuntimeError('BootstrapFailedOrWarned')
        # psql is a completed process: its SUPERUSER session has ended. Every
        # positive read/test below connects directly with its NOSUPERUSER LOGIN.
        result['bootstrap_connections_closed'] = True
        role_query = """SELECT json_build_object('current_user',current_user,
 'session_user',session_user,'version',current_setting('server_version_num'),
 'createrole_self_grant',current_setting('createrole_self_grant'),
 'role',(SELECT row_to_json(x) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,
 rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user)x),
 'memberships',(SELECT coalesce(json_agg(json_build_object('role',r.rolname,
 'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)),'[]')
 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE m.member=current_user::regrole));"""
        result['executors'] = {}
        for role in ('postgres', 'byetery_gap2b'):
            identity = query(role, role_query)
            if identity['current_user'] != role or identity['session_user'] != role:
                raise RuntimeError('DirectLoginIdentityMismatch')
            if identity['version'] != '170006' or identity['createrole_self_grant'] != '':
                raise RuntimeError('ExecutorVersionOrSettingMismatch')
            attrs = identity['role']
            if attrs['rolsuper'] or not all(attrs[k] for k in attrs if k not in ('rolname', 'rolsuper')):
                raise RuntimeError('ExecutorAttributesMismatch')
            expected_memberships = {'anon', 'authenticated', 'service_role', 'pg_monitor', 'pg_signal_backend'}
            if {m['role'] for m in identity['memberships']} != expected_memberships:
                raise RuntimeError('UnexpectedExecutorMembership')
            result['executors'][role] = identity
        for name in ('d2-008b1-registration-intents.sql', 'd2-008b2-direct-review.sql'):
            negative = psql(BOOTSTRAP, (ROOT / 'database/review' / name).read_bytes())
            (run / (name + '.negative.stderr')).write_bytes(negative.stderr)
            if negative.returncode != 3 or b'P0001' not in negative.stderr or b'ReviewRequiresNonSuperuserPostgresEmptySelfGrant' not in negative.stderr:
                raise RuntimeError('SuperuserNegativeControlFailed')
            result['negative'][name] = {'status': 'PASS', 'SQLSTATE': 'P0001',
                                      'error': 'ReviewRequiresNonSuperuserPostgresEmptySelfGrant'}
        cfg = {'host': '127.0.0.1', 'port': port, 'user': 'byetery_gap2b',
               'database': 'postgres', 'reviewUser': 'postgres'}
        config_bytes = (json.dumps(cfg, indent=2) + '\n').encode('utf-8')
        config.write_bytes(config_bytes)
        with (run / 'backend.log').open('wb') as log:
            suite = command(['cmd.exe', '/d', '/c', 'npm --prefix backend run verify'],
                            stdout=log, stderr=subprocess.STDOUT)
        text = (run / 'backend.log').read_text(encoding='utf-8-sig')
        counts = {key: int(re.search(r'\b' + key + r' (\d+)', text).group(1))
                  for key in ('tests', 'pass', 'fail', 'skipped')}
        result['suite'] = {**counts, 'exit_code': suite.returncode}
        if suite.returncode or counts != {'tests': 343, 'pass': 343, 'fail': 0, 'skipped': 0}:
            raise RuntimeError('BackendSuiteNotGreenSTOP')
        exit_code = 0
    except Exception as exc:
        failed = type(exc).__name__ + ': ' + str(exc)
        raise
    finally:
        try:
            if moved and (data / 'PG_VERSION').exists():
                state = capture([binary / 'pg_ctl.exe', '-D', short(data), 'status'])
                if state.returncode == 0:
                    result['cleanup']['remaining_fixture_databases'] = query('postgres',
                        "select count(*) from pg_database where datname ~ '^byetery_(b1|b2|gap2b)_' ;")
                    with (run / 'stop.log').open('wb') as log:
                        command([binary / 'pg_ctl.exe', '-D', short(data), '-m', 'fast', '-w', 'stop'],
                                stdout=log, stderr=subprocess.STDOUT, check=True)
                if capture([binary / 'pg_ctl.exe', '-D', short(data), 'status']).returncode != 3:
                    raise RuntimeError('TestClusterNotConfirmedStopped')
                checked(data).rename(checked(retained))
                result['cleanup']['test_cluster_stopped_retained'] = True
            if config_bytes is not None and config.exists():
                if config.read_bytes() != config_bytes:
                    raise RuntimeError('GeneratedConfigChangedDoNotRemove')
                config.unlink()
            if moved:
                if data.exists():
                    raise RuntimeError('LegacyRestoreTargetOccupied')
                checked(archive).rename(checked(data))
                result['cleanup']['legacy_cluster_restored_unmodified'] = True
            after = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in protected}
            result['SQL_test_hashes_after'] = after
            result['SQL_test_hashes_identical'] = after == hashes
            if after != hashes:
                raise RuntimeError('SQLOrTestsChanged')
        finally:
            result['failure'] = failed
            result['exit_code'] = exit_code
            (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
            print(json.dumps({'result': str((run / 'result.json').relative_to(ROOT)),
                              'suite': result['suite'], 'failure': failed}))
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
