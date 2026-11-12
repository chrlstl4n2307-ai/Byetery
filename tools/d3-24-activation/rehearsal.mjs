import { lstat, mkdir, mkdtemp, open, readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJournal, Budget, consumeBattery } from '../../backend/src/d3/operator-control.ts';
import { hash } from '../d3-evidence-capture/common.mjs';
import { d324ControlPaths } from '../d3-24-ratification/composition.mjs';
import { readD324Ledger, readD324Plan, RUN1, RUN_CAP } from '../d3-24-ratification/identity.mjs';
import { projectD324Journal, verifyD324Completion, verifyD324Readiness } from '../d3-24-ratification/readiness.mjs';
import { verifyD324CaptureInventory } from '../d3-24-ratification/capture.mjs';
import { verifyD324OwnerExport } from '../d3-24-ratification/owner-export.mjs';
import { createSingleAdmission, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { exactRecord } from '../d3-run1-launcher/grant-schema.mjs';
import { replayD324Launcher } from '../d3-run1-launcher/launcher.mjs';
import { OWNER_GRANT_PUBLIC_KEY_FINGERPRINT } from '../d3-run1-launcher/owner-grant-key.mjs';
import { verifyD324SessionPins } from '../d3-run1-launcher/session-pins.mjs';
import { fixture as fixtureSessions } from '../d3-run1-launcher/replay.mjs';
import { assertD324Unused, readD324Journal } from '../d3-24-operational/checkout.mjs';
import { verifyD324K5, verifyD324GrantScope } from '../d3-24-operational/policy.mjs';
import { verifyDetachedEd25519 } from './ed25519.mjs';
import { isD324ReviewBinding } from './manifest.mjs';
import { fixtureReads, fixtureReceipts, requestId, steps } from './fixtures.mjs';
import { captureSyntheticInChild } from './supervisor.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sandboxRoot = join(root, '.tools', 'd324-activation');
const classification = 'OFFLINE_SYNTHETIC';
export const SYNTHETIC_OPERATOR_APPROVAL = Symbol('D324_FIXTURE_APPROVAL');

async function persist(filePath, bytes, flag) {
  const file = await open(filePath, flag, 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}

function syntheticGrant({ envelope, compositionSha, k5Bytes, k5Sha256, now, key }) {
  check(exactRecord(envelope, ['grant', 'signature']) && exactRecord(key, ['publicKey', 'fingerprint']) &&
    key.fingerprint !== OWNER_GRANT_PUBLIC_KEY_FINGERPRINT, 'D324_FIXTURE_ENVELOPE_REJECTED');
  verifyD324K5(k5Bytes, k5Sha256, compositionSha);
  const message = verifyD324GrantScope(envelope.grant, compositionSha, now);
  verifyDetachedEd25519(message, envelope.signature, key.publicKey, key.fingerprint);
  return envelope.grant;
}

export async function createD324SyntheticRun({ crashAt, duplicateAt, rpcMismatchAt, wrongSqlAt, unexpectedHistory = false } = {}) {
  await mkdir(sandboxRoot, { recursive: true });
  check(await realpath(sandboxRoot) === resolve(sandboxRoot) && !(await lstat(sandboxRoot)).isSymbolicLink(),
    'D324_FIXTURE_DIRECTORY_REJECTED');
  // No caller-supplied directory. Even an approved fixture can only write here.
  const sandbox = await mkdtemp(join(sandboxRoot, 'sandbox-'));
  const controls = d324ControlPaths(sandbox);
  await mkdir(dirname(controls.journal));
  const history = await readD324Ledger();
  const { now, sessionConfig, observeSessions } = fixtureSessions([]);
  const budget = new Budget(RUN_CAP);
  const captures = [];
  const attempted = [];
  let completed = 0;
  let baseline;
  let terminal;
  const read = async () => {
    const observations = fixtureReads(history, completed);
    if (unexpectedHistory) observations.sql.operations.push({ ...observations.sql.operations[0] });
    if (completed === wrongSqlAt) observations.sql.operations.at(-1).hash = hash('different SQL transaction');
    return { ...observations, journalBytes: await readD324Journal(controls), baseline };
  };
  const confirmPrefix = async () => {
    const result = await verifyD324Readiness(await read());
    check(result.completed === completed, 'D324_FIXTURE_PREFIX_REJECTED');
    baseline = result.baseline;
  };
  async function replay(inputs, approval) {
    return replayD324Launcher({
      now, sessionConfig, observeSessions,
      async admitOnce() {
        const { manifest, session } = inputs;
        check(isD324ReviewBinding(manifest) && manifest.liveAuthority === false &&
          manifest.k5Sha256 === inputs.k5Sha256, 'D324_FIXTURE_MANIFEST_REQUIRED');
        await verifyD324SessionPins({ BYETERY_D324_SESSION_CONTROL_PATH: session.path,
          BYETERY_D324_SESSION_CONTROL_SHA256: manifest.sessionControlSha256 },
        { root, head: manifest.sha, parentExecutable: () => session.parentPath });
        const grant = syntheticGrant({ ...inputs, compositionSha: manifest.sha, now: now() });
        check(approval === SYNTHETIC_OPERATOR_APPROVAL, 'D324_FIXTURE_APPROVAL_REQUIRED');
        await assertD324Unused(controls);
        await confirmPrefix();
        await createSingleAdmission(controls.admission, grant.nonce)();
      },
      operatorFactory: async () => {
        await consumeBattery(dirname(controls.journal), RUN1.batteryId);
        await persist(controls.budget, '', 'wx');
        return {
          async step(method) {
            await confirmPrefix();
            const index = completed;
            const item = steps[index];
            check(item?.scope.method === method && budget.used < RUN_CAP, 'D324_FIXTURE_BUDGET_REJECTED');
            const scope = index === duplicateAt ? { ...item.scope, operationId: steps[0].scope.operationId } : item.scope;
            const key = 'd3:' + hash(RUN1.taskId + ':' + RUN1.planHash + ':' + method);
            budget.reserve(key);
            await persist(controls.budget, key + '\n', 'a');
            const confirmedAt = new Date(now() + index * 1000).toISOString();
            const row = { taskId: RUN1.taskId, gitSha: RUN1.businessSha, runId: RUN1.runId, batteryId: RUN1.batteryId,
              role: item.role, operation: method, timestamp: confirmedAt };
            await appendJournal(controls.journal, { ...row, phase: 'INTENT' });
            attempted.push(method);
            const identity = { operationId: scope.operationId, transactionHash: scope.transactionHash, confirmationMode: 'OBSERVED' };
            await appendJournal(controls.journal, { ...row, ...identity, phase: 'RESULT', reconciliation: 'CONFIRMED' });
            if (index === crashAt) throw Error('D324_FIXTURE_CRASH_AFTER_CONFIRMATION');
            const request = index === 0 ? undefined : requestId;
            await appendJournal(controls.journal, { ...row, ...identity, phase: 'RESULT', requestId: request,
              domainState: item.state, rewardState: item.reward });
            completed++;
            if (completed < RUN_CAP) await confirmPrefix();
            else terminal = await verifyD324Completion(await read());
            const manifest = Buffer.from('OFFLINE_SYNTHETIC:' + method);
            return { ...identity, operation: method, batteryId: RUN1.batteryId, requestId: request ?? null,
              confirmedBatteryState: item.state, confirmedRewardState: item.reward, confirmationLedger: scope.ledger, confirmedAt,
              ...(index === 2 || index === 3 ? { payload: { manifestBase64: manifest.toString('base64'), payloadHash: hash(manifest) } } : {}) };
          },
          async countingDecision() {
            check(terminal?.completed === RUN_CAP && terminal.confirmedExternal === 10 && captures.length === RUN_CAP &&
              (await readFile(controls.budget, 'utf8')).trimEnd().split('\n').length === RUN_CAP, 'D324_FIXTURE_COMPLETION_REJECTED');
            return { batteryId: RUN1.batteryId, sha: RUN1.businessSha, status: 'COMPLETED', countable: true };
          },
          async close() {},
        };
      },
      async preserve(scope) {
        const row = projectD324Journal(await readD324Journal(controls)).at(-1);
        check(row?.operationId === scope.operationId && row.transactionHash === scope.transactionHash, 'D324_FIXTURE_CAPTURE_JOURNAL_REJECTED');
        await persist(join(sandbox, scope.method + '.identity.json'), JSON.stringify(scope) + '\n', 'wx');
      },
      async capture(scope, attempt) {
        const { sql, rpc } = fixtureReceipts(scope, completed - 1 === rpcMismatchAt);
        const result = await captureSyntheticInChild(scope, sql, rpc);
        captures.push({ scope, attempt, directory: result.directory });
        return result;
      },
    }, {
      verifyPlan: readD324Plan,
      verifyCapture: ({ proof }, scope) => {
        check(proof.classification === classification && proof.chainVerified === false &&
          captures.at(-1)?.scope === scope, 'D324_FIXTURE_CAPTURE_REJECTED');
        return proof;
      },
    });
  }
  return Object.freeze({
    controls, replay,
    attempted: () => attempted.slice(),
    captures: () => captures.slice(),
    readJournal: () => readD324Journal(controls),
    async verifyExport(raw, digest, observations) {
      check(terminal?.completed === RUN_CAP && captures.length === RUN_CAP, 'D324_FIXTURE_EXPORT_INCOMPLETE');
      for (const capture of captures) {
        const proof = await verifyD324CaptureInventory(capture.directory, capture.scope, classification);
        check(proof.status === 'DURABLE_RECEIPT_CONVERGED_NORMALIZED', 'D324_FIXTURE_EXPORT_UNSEALED');
      }
      // This is the strict owner export verifier, never an export of fixture data.
      return verifyD324OwnerExport(raw, digest, { journalBytes: await readD324Journal(controls),
        scopes: captures.map(x => x.scope), observations });
    },
  });
}
