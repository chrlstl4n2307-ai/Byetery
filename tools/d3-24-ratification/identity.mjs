import { fileURLToPath } from 'node:url';
import { plan } from '../../backend/src/d3/model.ts';
import { canonical, hash, read, SPEC } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { readLedger as readHistoricalLedger } from '../d3-run1-launcher/live-readiness.mjs';
import { RUN1 as HISTORICAL, requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { D324_IDENTITY, D324_OWNER_EXPORT } from './profile.mjs';

export const RUN1 = D324_IDENTITY;
export const RUN_CAP = 5;
export const TX20_AUTHORIZED = false;
export const OWNER_QUERY_SHA256 = D324_OWNER_EXPORT.querySha256;
export const OWNER_QUERY_URL = new URL(D324_OWNER_EXPORT.queryUrl);
const root = fileURLToPath(new URL('../../', import.meta.url));
const originalLedger = new URL('../../docs/instaward/d3/review/D3-17-FRESH-3RUN/external-project-ledger.jsonl', import.meta.url);
const successorLedger = new URL('./external-project-ledger.jsonl', import.meta.url);
const ledgerSha256 = 'eaffd7521b905b995dba26150190c44592822e6e052509b3d65815adde25404d';
const historicalSha256 = 'a45ed3d36a12c08d64df0ad6f50338e58404526eb1983530a191174bc18b2633';
export const retired = Object.freeze({
  batteryId: HISTORICAL.batteryId, ledger: 5682924, operationId: '45f4fe9e-e423-419d-9d6a-7b3d7c4ff9f0',
  step: 'register_battery', txHash: 'b03fef3783f9cab7cae9515f617b3e2bccb85d15c4091b1dee13b6d0b7057b53',
});
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const hex = /^[a-f0-9]{64}$/;

// The original reviewed plan.json is historical and remains byte-identical.
export function readD324Plan(raw = read(fileURLToPath(new URL('../d3-24-composition/plans/security-repair-v2.json', import.meta.url)))) {
  check(hash(raw) === RUN1.planHash, 'D324_PLAN_DIGEST_REJECTED');
  const reviewed = plan(strictJson(raw.toString('utf8')));
  const run = reviewed.input.runs[0];
  check(reviewed.planHash === RUN1.planHash && reviewed.input.gitSha === RUN1.businessSha &&
    run.runId === RUN1.runId && run.batteryId === RUN1.batteryId && run.recipient === RUN1.recipient &&
    RUN1.recipient === HISTORICAL.recipient &&
    run.negativeCases.length === 0 && reviewed.blockers.length === 0 && reviewed.executionEnabled === false,
  'D324_PLAN_IDENTITY_REJECTED');
  return reviewed;
}

export async function readD324Ledger(raw = read(fileURLToPath(successorLedger))) {
  const original = read(fileURLToPath(originalLedger));
  check(hash(original) === historicalSha256 && hash(raw) === ledgerSha256 &&
    raw.subarray(0, original.length).equals(original), 'D324_LEDGER_DIGEST_REJECTED');
  const history = await readHistoricalLedger(root);
  let previous = null;
  const entries = raw.toString('utf8').trimEnd().split('\n').map(strictJson);
  for (const [index, { entryHash, ...body }] of entries.entries()) {
    check(body.sequence === index + 1 && body.previousEntryHash === previous &&
      entryHash === hash(canonical(body)), 'D324_LEDGER_CHAIN_REJECTED');
    previous = entryHash;
  }
  const policy = entries[0].payload;
  const last = entries.at(-1);
  const { historicalAddition: addition, ...p } = last.payload;
  const confirmed = [...history.confirmed, retired];
  const remaining = policy.executionLimitWithoutMarginAuth - confirmed.length;
  check(entries.length === 6 && last.type === 'D3_24_RATIFICATION_CANDIDATE' &&
    p.taskId === RUN1.taskId && p.status === 'PREPARED_NOT_RATIFIED' &&
    // This is an immutable historical proposal, not authority for the new plan.
    p.planHash === '3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d' &&
    p.operatorShaCandidate === 'c50e4eb1f7f538a231c5ecfc31d19283998dc234' &&
    addition.taskId === HISTORICAL.taskId && addition.status === 'CONSUMED_NON_COUNTING_RUN' &&
    addition.captureInventorySha256 === 'd83c28228a24a0a51c8bc8f3cbe150e3b7f981508c915ea20a9432778d3d6737' &&
    Object.entries(retired).every(([key, value]) => addition[key] === value), 'D324_LEDGER_SCOPE_REJECTED');
  check(policy.externalCap === 20 && policy.executionLimitWithoutMarginAuth === 19 && policy.authorizedReserved === 0 &&
    policy.contingencyStatus === 'LOCKED_OWNER_AUTHORIZATION_REQUIRED' && policy.txAuthorized === false &&
    p.txAuthorized === false && p.contingencyAuthorized === TX20_AUTHORIZED && p.externalCap === policy.externalCap &&
    p.executionLimitWithoutMarginAuth === policy.executionLimitWithoutMarginAuth &&
    confirmed.length === 5 && remaining === 14 && p.historicalConfirmed === confirmed.length &&
    p.remainingWithoutContingency === remaining && p.plannedSuccessful === 15 && p.threeRunsFitWithoutContingency === false &&
    p.proposedRun1Cap === RUN_CAP && RUN_CAP <= remaining, 'D324_BUDGET_REJECTED');
  check(new Set(confirmed.map(row => row.operationId)).size === confirmed.length &&
    new Set(confirmed.map(row => row.txHash)).size === confirmed.length, 'D324_DUPLICATE_HISTORY');
  return Object.freeze({ confirmed: Object.freeze(confirmed.map(row => Object.freeze({ ...row }))),
    confirmedConsumed: confirmed.length, excludedPreDispatch: Object.freeze(history.excludedPreDispatch),
    ledgerSha256, remaining, runCap: RUN_CAP, txAuthorized: false, contingencyAuthorized: TX20_AUTHORIZED,
    historicalCandidateBinding: Object.freeze({ operatorSha: p.operatorShaCandidate, planHash: p.planHash }),
    currentCandidateBinding: Object.freeze({ operatorSha: RUN1.businessSha, planHash: RUN1.planHash, status: 'REVIEW_ONLY' }) });
}

export function assertD324Scope(scope) {
  check(scope && Object.keys(scope).sort().join(',') === 'batteryId,ledger,method,operationId,transactionHash' &&
    scope.batteryId === RUN1.batteryId && typeof scope.operationId === 'string' && uuid.test(scope.operationId) &&
    typeof scope.transactionHash === 'string' && hex.test(scope.transactionHash) &&
    SPEC.methods.includes(scope.method) && Number.isSafeInteger(scope.ledger) && scope.ledger > retired.ledger,
  'D324_CAPTURE_SCOPE_REJECTED');
  return Object.freeze({ ...scope });
}
