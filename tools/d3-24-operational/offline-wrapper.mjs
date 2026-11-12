import { realpath } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { hash, read } from '../d3-evidence-capture/common.mjs';
import { strictJson } from '../d3-evidence-capture/owner-export.mjs';
import { readD324Ledger, readD324Plan, RUN1 } from '../d3-24-ratification/identity.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { exactRecord } from '../d3-run1-launcher/grant-schema.mjs';
import { gitRead } from '../d3-run1-launcher/live.mjs';
import { ACTIVATION_PARENT } from './bootstrap-pins.mjs';
import { loadD324Operator } from './operator-binding.mjs';
import { verifyBoundSession } from './owner-authorization.mjs';
import { verifyD324K5 } from './policy.mjs';

export async function verifyD324OfflineWrapper(root, directory) {
  check(await realpath(directory) === directory && dirname(directory) === join(root, '.tools') &&
    /^d324-wrapper-fixture-[A-Za-z0-9]+$/.test(basename(directory)), 'D324_OFFLINE_FIXTURE_REJECTED');
  const fixture = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(read(join(directory, 'fixture.json'), 8192)));
  check(exactRecord(fixture, ['schema', 'head', 'operatorRoot', 'entrySha256', 'k5Sha256', 'sessionControlSha256']) &&
    fixture.schema === 'D324_WRAPPER_OFFLINE_FIXTURE_V1', 'D324_OFFLINE_FIXTURE_REJECTED');
  const head = await gitRead(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const lineage = await gitRead(root, ['rev-list', '-1', '--parents', 'HEAD']);
  check(fixture.head === head && (head === ACTIVATION_PARENT || lineage === head + ' ' + ACTIVATION_PARENT) &&
    fixture.entrySha256 === hash(read(join(root, 'tools', 'd3-24-operational', 'live.mjs'), 65_536)),
  'D324_OFFLINE_COMPOSITION_REJECTED');
  await verifyBoundSession({ root, head, path: join(directory, 'session-control.json'), expectedHash: fixture.sessionControlSha256 });
  verifyD324K5(read(join(directory, 'K5-UNSIGNED-TEMPLATE.txt'), 8192), fixture.k5Sha256, head);
  const operator = await loadD324Operator(root, fixture.operatorRoot);
  const plan = readD324Plan(), ledger = await readD324Ledger();
  check(operator.sha === RUN1.businessSha && plan.planHash === RUN1.planHash &&
    ledger.runCap === 5 && ledger.confirmedConsumed === 5 && ledger.remaining === 14 &&
    !ledger.contingencyAuthorized, 'D324_OFFLINE_PROFILE_REJECTED');
  return 'D324_WRAPPER_OFFLINE_PASS';
}
