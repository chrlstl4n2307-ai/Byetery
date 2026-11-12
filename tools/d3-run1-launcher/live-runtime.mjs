import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

import { settings } from '../../backend/src/application/config.ts';
import { plan } from '../../backend/src/d3/model.ts';
import { activationArguments, preflight } from '../../backend/src/d3/operator-control.ts';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { ROLES, RUN1, preflightLeafCode, requireThat, runControlPaths } from './boundaries.mjs';
import { promptFailureCode } from './diagnostics.mjs';
import { createNoEcho, PromptFailure } from './no-echo.mjs';
import { checkSharedGitDirectory, checkedOutCommit, frozenOperatorPath } from './f1-checkout.mjs';
import { readChain } from './live-chain.mjs';
import { evaluateReadiness, readLedger } from './live-readiness.mjs';
import { assertRoleIdentities, lookupRole, readSql } from './live-sql.mjs';

const { Pool } = createRequire(new URL('../../backend/package.json', import.meta.url))('pg');
const exec = promisify(execFile);
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
      requireThat(row.taskId === RUN1.taskId && row.gitSha === RUN1.businessSha &&
        row.runId === RUN1.runId && row.batteryId === RUN1.batteryId, 'RUN1_JOURNAL_IDENTITY_REJECTED');
      return row;
    });
}

// Reuses the reviewed local Stellar CLI public-key probe, never its signing commands.
export async function checkPublicSigners(root, env) {
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

export function createRoleResolver({ checkAdmission, lookup, prompt, diagnostics }) {
  return Object.freeze({
    async resolve(role) {
      try {
        await checkAdmission(role);
      } catch (error) {
        diagnostics?.event('CREDENTIAL_REJECTED', role);
        throw error;
      }
      let email;
      try {
        email = await lookup(role);
        diagnostics?.event('CREDENTIAL_SQL_OK', role);
      } catch (error) {
        diagnostics?.event('CREDENTIAL_SQL_FAIL', role, undefined, { leaf: preflightLeafCode(error) });
        throw error;
      }
      try {
        const password = await prompt(role);
        diagnostics?.event('PROMPT_OK', role);
        return { email, password };
      } catch (error) {
        diagnostics?.event(promptFailureCode(error instanceof PromptFailure ? error.code : undefined), role);
        throw error;
      }
    },
  });
}

export async function assertNoRun1Controls(common) {
  for (const path of Object.values(runControlPaths(common))) {
    requireThat(!await exists(path), 'RUN1_PRIOR_CONTROL_REJECTED');
  }
}

export async function bindRuntime({ head, env, root, gitRead, localOrigin, diagnostics }) {
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
  const { admission: admissionPath, journal: journalPath } = runControlPaths(gitDirectory);
  const preAdmission = () => assertNoRun1Controls(gitDirectory);
  await preAdmission();
  const history = await readLedger(root);
  const reviewedPlan = plan(JSON.parse(await readFile(join(root, 'docs/instaward/d3/review/D3-17-FRESH-3RUN/new-plan.json'), 'utf8')));
  requireThat(reviewedPlan.planHash === RUN1.planHash && reviewedPlan.input.gitSha === RUN1.businessSha &&
    reviewedPlan.input.runs[0]?.batteryId === RUN1.batteryId && reviewedPlan.input.runs[0]?.recipient === RUN1.recipient,
  'RUN1_PLAN_REJECTED');
  const args = activationArguments(['--live', '--task-id', RUN1.taskId, '--expected-sha', RUN1.businessSha]);
  const config = await settings();
  requireThat(config.mode === 'TESTNET' && config.deploymentId === SPEC.deployment, 'SQL_CONFIG_TARGET_REJECTED');
  const sqlPool = new Pool({ ...config.database, max: 2, query_timeout: 9000, statement_timeout: 9000,
    options: '-c default_transaction_read_only=on', application_name: 'byetery-d3-k6-readonly' });
  sqlPool.on('error', () => {});
  let baseline;
  let rolesChecked = false;

  const prompt = createNoEcho();
  const secureStore = createRoleResolver({
    diagnostics,
    async checkAdmission(role) {
      requireThat(ROLES.includes(role) && (await exists(admissionPath))?.isFile(), 'ROLE_BEFORE_ADMISSION_REJECTED');
    },
    lookup: role => lookupRole(sqlPool, role),
    prompt: prompt.read,
  });

  async function readSources({ requestId, identity }) {
    requireThat(identity === RUN1 && await checkedOutCommit(root) === head, 'K6_COMPOSITION_CHANGED');
    await checkSharedGitDirectory(root, frozenRoot);
    await frozenOperatorPath(frozenRoot);
    const gitAt = Date.now();
    const journal = await readJournal(journalPath);
    const [chain, signers] = await Promise.all([
      readChain(),
      checkPublicSigners(frozenRoot, env),
    ]);
    const sql = await readSql(sqlPool, { coordinate: true });
    const sqlAt = Date.now();
    const { baseline: first, ...readiness } = evaluateReadiness({ sql, chain, history, journal, baseline });
    if (!rolesChecked) {
      await assertRoleIdentities(sqlPool);
      rolesChecked = true;
    }
    const observation = {
      ...readiness, taskId: RUN1.taskId, runId: RUN1.runId, observedAt: Date.now(),
      git: { sha: RUN1.businessSha, clean: true }, sameRuntimeSha: RUN1.businessSha, mode: 'TESTNET',
      networkId: SPEC.networkId, contractId: SPEC.contract, wasmSha256: SPEC.wasm, deploymentId: SPEC.deployment,
      payer: SPEC.contract, unresolved: 0, pendingDispatches: 0, signers, uniqueBatteryIds: true, simulationBeforeSend: true,
    };
    preflight(reviewedPlan, args, observation, env);
    baseline = first;
    return { requestId, preflight: observation, observations: [
      { source: 'LOCAL_GIT', observedAt: gitAt, ledger: null },
      { source: 'SUPABASE_SQL_READ_ONLY', observedAt: sqlAt, ledger: null },
      { source: 'STELLAR_RPC_TESTNET', observedAt: chain.observedAt, ledger: chain.ledger },
    ] };
  }
  return {
    runtime: Object.freeze({ apiOrigin, frozenRoot, publishableKey: config.publicKey, readSources, secureStore, sqlPool }),
    preAdmission, async close() {
      try { prompt.close(); } finally { await sqlPool.end(); }
    },
  };
}
