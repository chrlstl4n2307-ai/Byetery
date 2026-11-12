import { SPEC } from '../d3-evidence-capture/common.mjs';
import { RUN1, ROLES, requireThat } from './boundaries.mjs';

const snapshot = `
with occupied as (
 select battery_id from app_private.battery_records where deployment_id=$1 and battery_id=$2
 union all select battery_id from chain_private.batteries where deployment_id=$1 and battery_id=$2
 union all select battery_id from app_private.return_requests where deployment_id=$1 and battery_id=$2
 union all select battery_id from chain_private.return_requests where deployment_id=$1 and battery_id=$2
 union all select battery_id from app_private.stellar_operations where deployment_id=$1 and battery_id=$2
 union all select battery_id from api_private.testnet_work where deployment_id=$1 and battery_id=$2
 union all select battery_id from app_private.evidence_versions where deployment_id=$1 and battery_id=$2
 union all select battery_id from app_private.reward_attempts where deployment_id=$1 and battery_id=$2
 union all select battery_id from review_private.registration_intents where deployment_id=$1 and battery_id=$2
), lock_key as (select hashtextextended($1::text,0) n)
select current_setting('transaction_read_only') as read_only,
 (select count(*)::int from occupied) as occupied,
 (select jsonb_build_object('mode',mode,'network',encode(network_id,'hex'),'contract',contract_address,
   'wasm',encode(wasm_hash,'hex'),'admin',admin,'service',service,'sac',reward_token,'reward',reward_amount::text)
  from chain_private.deployments where id=$1) as deployment,
 (select count(*)::int from api_private.testnet_source_leases where network_id=decode($3,'hex')
  and lease_until>clock_timestamp()) as active_leases,
 (select count(*)::int from pg_locks l,lock_key k where l.locktype='advisory'
  and l.database=(select oid from pg_database where datname=current_database())
  and l.objsubid=1 and l.classid::bigint=((k.n>>32)&4294967295)
  and l.objid::bigint=(k.n&4294967295)
  and not ($4::boolean and l.pid=pg_backend_pid() and l.mode='ShareLock' and l.granted)) as reconciliation_locks,
 (select count(*)::int from app_private.stellar_operations where deployment_id=$1
  and state not in ('CONFIRMED','REJECTED','CANCELLED_LOCAL')) as pending,
 (select count(*)::int from api_private.testnet_work where deployment_id=$1
  and state not in ('PROJECTED','CONFIRMED_FAILED','EXPIRED_NOT_APPLIED','ABORTED_PRE_DISPATCH')) as uncertain,
 (select count(*)::int from app_private.return_requests where deployment_id=$1
  and battery_id<>$2 and reservation_state='HELD') as foreign_holds,
 (select count(*)::int from review_private.registration_intents where deployment_id=$1
  and (battery_id=$2 or status='WAITING')) as review_intents,
 (select jsonb_build_object('state',state,'reward',reward_state,'requestId',encode(request_id,'hex'))
  from chain_private.batteries where deployment_id=$1 and battery_id=$2) as battery,
 (select coalesce(jsonb_agg(jsonb_build_object('id',encode(request_id,'hex'),'recipient',recipient_snapshot,'state',reservation_state)),'[]')
  from app_private.return_requests where deployment_id=$1 and battery_id=$2) as requests,
 (select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'battery',o.battery_id,'command',o.command,'state',o.state,
  'work',w.state,'dispatches',w.dispatch_attempts,'hash',encode(e.transaction_hash,'hex'),'source',e.source_account,
  'sequence',e.sequence::text,'ledger',w.confirmation->'confirmationLedger','receiptHash',w.confirmation->>'transactionHash')
  order by o.created_at,o.id),'[]')
  from app_private.stellar_operations o
  left join api_private.testnet_work w on w.deployment_id=o.deployment_id and w.operation_id=o.id
  left join api_private.testnet_envelopes e on e.deployment_id=o.deployment_id and e.operation_id=o.id
  where o.deployment_id=$1 and o.battery_id like 'BYE-D3-%') as operations`;

const links = `
with active as (
 select w.address,w.user_id,w.id,
  exists(select 1 from api_private.wallet_challenges h where h.id::text=w.proof_reference
   and h.deployment_id=w.deployment_id and h.user_id=w.user_id and h.address=w.address and h.network_id=w.network_id
   and h.purpose='LINK_WALLET' and h.consumed_at is not null and h.signing_scheme='SEP53_V2') as verified
 from app_private.wallet_links w join app_private.users u on u.id=w.user_id
 where w.deployment_id=$1 and w.address=any($5::text[]) and w.revoked_at is null and w.verified_at is not null
  and u.status='ACTIVE' and exists(select 1 from api_private.memberships m where m.deployment_id=w.deployment_id
    and m.user_id=w.user_id and m.role='USER' and m.enabled))
select address,verified,count(*) over(partition by user_id)::int as matching_owner_links,
 (select count(*)::int from app_private.wallet_links where deployment_id=$1
  and address=active.address and revoked_at is null) as active_links
from active order by address`;

// A single statement keeps wallet and deployment facts in the same snapshot.
const readiness = `with facts as (${snapshot}), wallets as (${links})
select facts.*, (select coalesce(jsonb_agg(wallets order by address),'[]'::jsonb) from wallets) as wallets
from facts`;

const roleIdentity = `
select a.email from api_private.memberships m
join app_private.users u on u.id=m.user_id join auth.users a on a.id=u.auth_user_id
where m.deployment_id=$1 and m.role=$2 and m.enabled and u.status='ACTIVE'
 and a.email<>'' and a.email_confirmed_at is not null and a.deleted_at is null and (a.banned_until is null or a.banned_until<now())
 and (($2='USER' and exists(select 1 from app_private.wallet_links w where w.deployment_id=m.deployment_id
    and w.user_id=u.id and w.address=$4 and w.revoked_at is null and w.verified_at is not null))
   or ($2<>'USER' and m.actor_address is not distinct from $3))`;

async function readOnly(pool, read, coordinate = false) {
  const client = await pool.connect();
  try {
    await client.query(coordinate ? 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY' :
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (coordinate) {
      await client.query("SET LOCAL lock_timeout='3s'");
      try {
        await client.query('select pg_advisory_xact_lock_shared(hashtextextended($1::text,0))', [SPEC.deployment]);
      } catch (error) {
        if (error?.code === '55P03') throw new Error('SQL_QUIESCENCE_REJECTED');
        throw error;
      }
    }
    return await read(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

export async function readSql(pool, options) {
  return readSqlForRun(pool, RUN1, options);
}

export async function readSqlForRun(pool, run, { coordinate = false } = {}) {
  requireThat(/^[A-Z0-9-]{1,32}$/.test(run.batteryId), 'SQL_BATTERY_ID_REJECTED');
  return readOnly(pool, async client => {
    const { rows } = await client.query({ text: readiness, values: [SPEC.deployment, run.batteryId, SPEC.networkId,
      coordinate, SPEC.wallets] });
    requireThat(rows.length === 1 && rows[0].read_only === 'on', 'SQL_READONLY_REQUIRED');
    return rows[0];
  }, coordinate);
}

function roleParams(role) {
  requireThat(ROLES.includes(role), 'ROLE_NOT_ALLOWED');
  // Application ADMIN is unbound by schema. The chain ADMIN is checked separately.
  const actor = role === 'COLLECTOR' || role === 'RECYCLER' ? SPEC.actors[role.toLowerCase()] : null;
  return [SPEC.deployment, role, actor, RUN1.recipient];
}

export async function assertRoleIdentities(pool) {
  return readOnly(pool, async client => {
    for (const role of ROLES) {
      const { rows } = await client.query({ text: `select count(*)::int as eligible from (${roleIdentity}) identities`,
        values: roleParams(role) });
      requireThat(rows[0]?.eligible === 1, 'ROLE_IDENTITY_NOT_UNIQUE');
    }
  });
}

export async function lookupRole(pool, role) {
  const values = roleParams(role);
  return readOnly(pool, async client => {
    const { rows } = await client.query({ text: roleIdentity, values });
    requireThat(rows.length === 1 && typeof rows[0].email === 'string' && rows[0].email.length > 0, 'ROLE_IDENTITY_NOT_UNIQUE');
    return rows[0].email;
  });
}
