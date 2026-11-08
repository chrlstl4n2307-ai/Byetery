import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

import { settings } from '../../backend/src/application/config.ts';
import { plan } from '../../backend/src/d3/model.ts';
import { activationArguments, preflight } from '../../backend/src/d3/operator-control.ts';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { ROLES, RUN1, requireThat } from './boundaries.mjs';
import { checkSharedGitDirectory, checkedOutCommit, frozenOperatorPath } from './f1-checkout.mjs';
import { readChain } from './live-chain.mjs';
import { evaluateReadiness, readLedger } from './live-readiness.mjs';
import { lookupRole, readSql } from './live-sql.mjs';

const { Pool } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
const exec = promisify(execFile);
const controlName = 'byetery-d3-17-run1.launcher-admission';
const systemEnv = /^(SYSTEMROOT|WINDIR|PATH|PATHEXT|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|HOMEDRIVE|HOMEPATH|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA)$/i;

async function exists(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function readJournal(path) {
  const file = await exists(path);
  if (!file) return [];
  requireThat(file.isFile() && file.size <= 262_144, 'RUN1_JOURNAL_REJECTED');
  const text = await readFile(path, 'utf8');
  requireThat(text === '' || text.endsWith('\n'), 'RUN1_JOURNAL_INCOMPLETE');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(row => row.phase === 'RESULT' && row.domainState)
    .map(row => {
      requireThat(row.taskId === RUN1.runId && row.gitSha === RUN1.businessSha &&
        row.runId === 'RUN1' && row.batteryId === RUN1.batteryId, 'RUN1_JOURNAL_IDENTITY_REJECTED');
      return row;
    });
}

// Reuses the reviewed local Stellar CLI public-key probe, never its signing commands.
async function checkPublicSigners(root, env) {
  const safeEnv = Object.fromEntries(Object.entries(env).filter(([key]) => systemEnv.test(key)));
  const options = { cwd: root, env: safeEnv, windowsHide: true, timeout: 30_000, maxBuffer: 4096, encoding: 'utf8' };
  const { stdout: version } = await exec('stellar', ['--version'], options);
  requireThat(/^stellar 28\.0\.0(?:\s|$)/.test(version), 'SIGNER_CLI_IDENTITY_REJECTED');
  return Promise.all(Object.entries(SPEC.actors).map(async ([role, address]) => {
    const { stdout } = await exec('stellar', ['--quiet', 'keys', 'public-key',
      'secure_store:org.stellar.cli-byetery-tn20260926-' + role, '--hd-path', '0'], options);
    requireThat(stdout.trim() === address, 'PUBLIC_SIGNER_IDENTITY_REJECTED');
    return { address, available: true };
  }));
}

// The existing no-echo, in-memory owner input boundary. No credential is staged in a file or a child environment.
function noEcho(role, input = process.stdin, output = process.stdout) {
  requireThat(input.isTTY && output.isTTY && typeof input.setRawMode === 'function', 'OWNER_TTY_REQUIRED');
  return new Promise((resolve, reject) => {
    const priorRaw = Boolean(input.isRaw);
    let value = '';
    function finish(cancelled) {
      clearTimeout(timeout);
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onEnd);
      input.setRawMode(priorRaw);
      input.pause();
      output.write('\n');
      const password = value;
      value = '';
      if (cancelled || !password) reject(Error('OWNER_INPUT_CANCELLED'));
      else resolve(password);
    }
    const onEnd = () => finish(true);
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish(false);
        if (ch === '\b' || ch === '\x7f') value = [...value].slice(0, -1).join('');
        else if (ch.charCodeAt(0) < 32 || value.length >= 256) return finish(true);
        else value += ch;
      }
    };
    output.write('Contraseña de ' + role + ' (sin eco): ');
    input.setRawMode(true);
    input.setEncoding('utf8');
    const timeout = setTimeout(onEnd, 30_000);
    input.once('end', onEnd);
    input.once('error', onEnd);
    input.on('data', onData);
    input.resume();
  });
}

export async function bindRuntime({ head, env, root, gitRead, localOrigin }) {
  const frozenRoot = env.BYETERY_K6_FROZEN_ROOT;
  const apiOrigin = localOrigin(env.BYETERY_K6_API_ORIGIN);
  requireThat(typeof frozenRoot === 'string' && isAbsolute(frozenRoot) &&
    process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === 'function', 'LOCAL_BINDINGS_REQUIRED');
  requireThat(!Object.keys(env).some(key => /^(?:PG|DATABASE_URL$|SUPABASE_SERVICE_ROLE_KEY$)/i.test(key)), 'SECRET_ENV_REJECTED');
  await checkSharedGitDirectory(root, frozenRoot);
  await frozenOperatorPath(frozenRoot);
  const gitDirectory = await gitRead(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const controls = join(gitDirectory, 'byetery-d3-operator');
  const directory = await exists(controls);
  requireThat(!directory || directory.isDirectory() && !directory.isSymbolicLink(), 'RUN1_CONTROL_DIRECTORY_REJECTED');
  const admissionPath = join(gitDirectory, controlName);
  const journalPath = join(controls, RUN1.runId + '-' + RUN1.businessSha + '.jsonl');
  const forbiddenControls = [admissionPath, join(controls, 'operator.lock'), journalPath,
    join(controls, RUN1.planHash + '.budget'), join(controls, RUN1.batteryId + '.consumed')];
  const preAdmission = async () => {
    for (const path of forbiddenControls) requireThat(!await exists(path), 'RUN1_PRIOR_CONTROL_REJECTED');
  };
  await preAdmission();
  const history = await readLedger(root);
  const reviewedPlan = plan(JSON.parse(await readFile(join(root, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/new-plan.json'), 'utf8')));
  requireThat(reviewedPlan.planHash === RUN1.planHash && reviewedPlan.input.gitSha === RUN1.businessSha &&
    reviewedPlan.input.runs[0]?.batteryId === RUN1.batteryId && reviewedPlan.input.runs[0]?.recipient === RUN1.recipient,
  'RUN1_PLAN_REJECTED');
  const args = activationArguments(['--live', '--task-id', RUN1.runId, '--expected-sha', RUN1.businessSha]);
  const config = await settings();
  requireThat(config.mode === 'TESTNET' && config.deploymentId === SPEC.deployment, 'SQL_CONFIG_TARGET_REJECTED');
  const sqlPool = new Pool({ ...config.database, max: 2, query_timeout: 9000, statement_timeout: 9000,
    options: '-c default_transaction_read_only=on', application_name: 'byetery-d3-k6-readonly' });
  sqlPool.on('error', () => {});
  let baseline;

  const secureStore = Object.freeze({
    async resolve(role) {
      requireThat(ROLES.includes(role) && (await exists(admissionPath))?.isFile(), 'ROLE_BEFORE_ADMISSION_REJECTED');
      const email = await lookupRole(sqlPool, role);
      return { email, password: await noEcho(role) };
    },
  });
  async function readSources({ requestId, identity }) {
    requireThat(identity === RUN1 && await checkedOutCommit(root) === head, 'K6_COMPOSITION_CHANGED');
    await checkSharedGitDirectory(root, frozenRoot);
    await frozenOperatorPath(frozenRoot);
    const gitAt = Date.now();
    const journal = await readJournal(journalPath);
    const [sqlResult, chain, signers] = await Promise.all([
      readSql(sqlPool).then(sql => ({ sql, at: Date.now() })),
      readChain(),
      checkPublicSigners(frozenRoot, env),
    ]);
    const { baseline: first, ...readiness } = evaluateReadiness({ sql: sqlResult.sql, chain, history, journal, baseline });
    const observation = {
      ...readiness, taskId: RUN1.runId, runId: 'RUN1', observedAt: Date.now(),
      git: { sha: RUN1.businessSha, clean: true }, sameRuntimeSha: RUN1.businessSha, mode: 'TESTNET',
      networkId: SPEC.networkId, contractId: SPEC.contract, wasmSha256: SPEC.wasm, deploymentId: SPEC.deployment,
      payer: SPEC.contract, unresolved: 0, pendingDispatches: 0, signers, uniqueBatteryIds: true, simulationBeforeSend: true,
    };
    preflight(reviewedPlan, args, observation, env);
    baseline = first;
    return { requestId, preflight: observation, observations: [
      { source: 'LOCAL_GIT', observedAt: gitAt, ledger: null },
      { source: 'SUPABASE_SQL_READ_ONLY', observedAt: sqlResult.at, ledger: null },
      { source: 'STELLAR_RPC_TESTNET', observedAt: chain.observedAt, ledger: chain.ledger },
    ] };
  }
  return {
    runtime: Object.freeze({ apiOrigin, frozenRoot, publishableKey: config.publicKey, readSources, secureStore, sqlPool }),
    preAdmission, close: () => sqlPool.end(),
  };
}
