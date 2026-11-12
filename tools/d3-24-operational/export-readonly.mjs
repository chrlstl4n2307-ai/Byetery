import { mkdir, mkdtemp, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytes, hash, read, SPEC } from '../d3-evidence-capture/common.mjs';
import { RUN1, RUN_CAP, uuid, OWNER_QUERY_SHA256, OWNER_QUERY_URL } from '../d3-24-ratification/identity.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';

const exportRoot = fileURLToPath(new URL('../../.tools/d324-final-export', import.meta.url));

// The empty probe checks permissions and read-only status before admission.
// A real export is scoped to the five IDs from the verified inventory.
export async function readD324OwnerExport(pool, operationIds) {
  check(Array.isArray(operationIds) && [0, RUN_CAP].includes(operationIds.length) &&
    operationIds.every(id => typeof id === 'string' && uuid.test(id)) &&
    new Set(operationIds).size === operationIds.length, 'D324_EXPORT_INPUT_REJECTED');
  const raw = read(fileURLToPath(OWNER_QUERY_URL), 65_536);
  check(hash(raw) === OWNER_QUERY_SHA256, 'D324_OWNER_QUERY_REJECTED');
  const text = raw.toString('utf8').replaceAll(":'operation_ids'", '$1').replaceAll(":'query_sha256'", '$2');
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query({ text, values: [JSON.stringify(operationIds), OWNER_QUERY_SHA256], query_timeout: 9000 });
    const data = rows[0]?.owner_export;
    const metadata = data?.metadata;
    const requested = metadata?.requested_operation_ids ?? [];
    check(rows.length === 1 && data?.schema === 'BYETERY_D324_OWNER_EXPORT_V1' && metadata?.transaction_read_only === 'on' &&
      metadata.query_sha256 === OWNER_QUERY_SHA256 && metadata.deployment_id === SPEC.deployment &&
      metadata.task_id === RUN1.taskId && metadata.battery_id === RUN1.batteryId && metadata.plan_hash === RUN1.planHash &&
      Array.isArray(requested) && JSON.stringify(requested) === JSON.stringify(operationIds.toSorted()) &&
      Array.isArray(data.rows) && data.rows.length === operationIds.length, 'D324_EXPORT_QUERY_RESULT_REJECTED');
    const content = bytes(data);
    return { content, sha256: hash(content) };
  } finally {
    try { await client.query('ROLLBACK'); }
    finally { client.release(); }
  }
}

export async function preserveD324OwnerExport({ content, sha256 }) {
  check(Buffer.isBuffer(content) && hash(content) === sha256, 'D324_EXPORT_DIGEST_REJECTED');
  await mkdir(exportRoot, { recursive: true });
  check(await realpath(exportRoot) === exportRoot, 'D324_EXPORT_DIRECTORY_REJECTED');
  const directory = await mkdtemp(join(exportRoot, 'D3-24-RUN1-'));
  for (const [name, data] of [['owner-export.json', content], ['OWNER_EXPORT_SHA256', sha256 + '\n']]) {
    const file = await open(join(directory, name), 'wx', 0o600);
    try { await file.writeFile(data); await file.sync(); }
    finally { await file.close(); }
  }
  return directory;
}
