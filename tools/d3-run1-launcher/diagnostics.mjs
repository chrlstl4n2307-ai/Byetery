import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLES, RUN1, requireThat, sanitizePreflightInnerCode, sanitizePreflightLeafCode, sanitizePreflightPhase } from './boundaries.mjs';

const promptFailures = new Set([
  'OWNER_TTY_REQUIRED', 'PROMPT_CONCURRENT', 'PROMPT_EMPTY', 'PROMPT_TIMEOUT',
  'PROMPT_CONTROL_CHAR', 'PROMPT_STREAM_END', 'PROMPT_STREAM_ERROR', 'PROMPT_TOO_LONG',
]);
const roleStages = new Set([
  'CREDENTIAL_ENTER', 'CREDENTIAL_SQL_OK', 'CREDENTIAL_SQL_FAIL', 'PROMPT_OK',
  ...promptFailures, 'CREDENTIAL_RETURN', 'CREDENTIAL_REJECTED',
]);
const preflightStages = new Set(['PREFLIGHT_ENTER', 'PREFLIGHT_OK', 'PREFLIGHT_FAIL']);
const entryFailures = new Set([
  'LOCAL_EXECUTION_REJECTED', 'EXACT_ARGV_REQUIRED', 'COMPOSITION_CHECKOUT_REJECTED',
  'SESSION_PINS_REJECTED', 'OWNER_GRANT_REJECTED', 'RUNTIME_BINDING_REJECTED',
  'PRE_ADMISSION_READS_REJECTED', 'RUN1_STOP_REQUIRES_RECONCILIATION',
  'STOP_SESSION_GATE', 'STOP_INVALID_OPERATOR_EVIDENCE', 'STOP_CAPTURE_UNVERIFIED',
  'STOP_OPERATOR_DECISION', 'STOP_OPERATOR_CLOSE_REQUIRES_REVIEW', 'STOP_LIVE_PREFLIGHT',
]);
const knownFailures = new Set(['CREDENTIAL_SQL_FAIL', 'CREDENTIAL_REJECTED', ...promptFailures, 'PREFLIGHT_FAIL']);
const residual = new Map([
  ['STOP_RUN_ADMISSION', 'ADMISSION'],
  ['STOP_OPERATOR_START_REQUIRES_REVIEW', 'STARTUP_OPERATOR_INDETERMINATE'],
  ['STOP_OPERATOR_REQUIRES_REVIEW', 'STEP_OPERATOR_INDETERMINATE'],
]);
const sha256 = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;

export function promptFailureCode(code) {
  return promptFailures.has(code) ? code : 'PROMPT_STREAM_ERROR';
}

export function createDiagnostics(now = Date.now) {
  const events = [];
  let preflightReadCount = 0;
  function event(stage, role, innerCode, extra) {
    requireThat((roleStages.has(stage) && ROLES.includes(role)) ||
      (preflightStages.has(stage) && role === undefined), 'UNSAFE_DIAGNOSTIC_EVENT');
    const row = { schemaVersion: 1, taskId: RUN1.taskId, stage, errorCode: stage, timestamp: new Date(now()).toISOString() };
    if (role !== undefined) row.role = role;
    if (stage === 'PREFLIGHT_ENTER') preflightReadCount += 1;
    if (stage === 'CREDENTIAL_SQL_FAIL') row.leaf = sanitizePreflightLeafCode(extra?.leaf);
    if (stage === 'PREFLIGHT_FAIL') {
      const sanitized = sanitizePreflightInnerCode(innerCode);
      if (sanitized) row.innerCode = sanitized;
      row.leaf = sanitizePreflightLeafCode(extra?.leaf);
      const phase = sanitizePreflightPhase(extra?.phase);
      if (phase) row.phase = phase;
      const readNumber = (preflightReadCount >= 1 && preflightReadCount <= 32) ? preflightReadCount : extra?.readNumber;
      if (Number.isInteger(readNumber) && readNumber >= 1 && readNumber <= 32) row.readNumber = readNumber;
    }
    events.push(Object.freeze(row));
  }
  function fatal(status, compositionRootSha, sessionControlSha256) {
    const last = events.at(-1);
    const internal = residual.get(status);
    const observedFailure = (internal === 'STARTUP_OPERATOR_INDETERMINATE' ||
      internal === 'STEP_OPERATOR_INDETERMINATE' || status === 'PRE_ADMISSION_READS_REJECTED') &&
      knownFailures.has(last?.stage) ? last : undefined;
    const stage = observedFailure?.stage ?? internal ??
      (entryFailures.has(status) ? status : 'RUN1_STOP_REQUIRES_RECONCILIATION');
    const record = { schemaVersion: 1, taskId: RUN1.taskId, stage, errorName: 'K7Stop',
      errorCode: stage, timestamp: new Date(now()).toISOString(), events: [...events] };
    if (observedFailure?.role) record.role = observedFailure.role;
    if (observedFailure?.leaf) record.leaf = observedFailure.leaf;
    if (observedFailure?.stage === 'PREFLIGHT_FAIL') {
      if (observedFailure.phase) record.phase = observedFailure.phase;
      if (Number.isInteger(observedFailure.readNumber)) record.readNumber = observedFailure.readNumber;
    }
    if (commit.test(compositionRootSha ?? '')) record.compositionRootSha = compositionRootSha;
    if (sha256.test(sessionControlSha256 ?? '')) record.sessionControlSha256 = sessionControlSha256;
    return record;
  }
  return Object.freeze({ event, fatal });
}

// Create exactly one private diagnostic artifact per failed invocation.
export async function persistFatal(diagnostics, status, head, controlHash, root = tmpdir()) {
  const directory = await mkdtemp(join(root, 'byetery-k7-fatal-'));
  const path = join(directory, 'fatal.json');
  const record = diagnostics.fatal(status, head, controlHash);
  const bytes = Buffer.from(JSON.stringify(record) + '\n');
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  const persisted = await readFile(path);
  requireThat(persisted.equals(bytes), 'DIAGNOSTIC_PERSIST_FAILED');
  return { path, sha256: createHash('sha256').update(persisted).digest('hex'), stage: record.stage };
}
