import { createHash } from 'node:crypto';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { Settings } from './config.ts';
import type { Identity } from './auth.ts';
import type { Deployment, Command } from '../domain.ts';
import { MockStellarService } from '../mock-stellar-service.ts';
import { requireThat } from './errors.ts';
export type Db = PoolClient;
export async function one<T extends QueryResultRow = QueryResultRow>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}
export class Repository {
  readonly pool: Pool;
  readonly deploymentId: string;
  constructor(config: Settings) { this.pool = new Pool(config.database); this.deploymentId = config.deploymentId; }
  async transaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('begin'); await db.query("set local lock_timeout='15s'");
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[this.deploymentId]);
      const result = await work(db); await db.query('commit'); return result;
    } catch (error) { await db.query('rollback').catch(()=>{}); throw error; }
    finally { db.release(); }
  }
  async principal(db: Db, identity: Identity): Promise<string> {
    const session = await one(db, `select 1 from auth.sessions where id=$1 and user_id=$2
      and (not_after is null or not_after > now())`, [identity.sessionId,identity.authUserId]);
    requireThat(session,401,'SessionRevoked');
    await db.query('insert into app_private.users(auth_user_id) values($1) on conflict(auth_user_id) do nothing',[identity.authUserId]);
    const user = await one(db,'select id,status from app_private.users where auth_user_id=$1',[identity.authUserId]);
    requireThat(user?.status === 'ACTIVE',403,'UserDisabled');
    await db.query(`insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'USER') on conflict do nothing`,[this.deploymentId,user.id]);
    return user.id as string;
  }
  async role(db: Db, user: string, role: string): Promise<string | null> {
    const row = await one(db,'select actor_address from api_private.memberships where deployment_id=$1 and user_id=$2 and role=$3 and enabled',[this.deploymentId,user,role]);
    requireThat(row,403,'RoleRequired'); return row.actor_address as string | null;
  }
  async config(db: Db): Promise<Deployment> {
    const r = await one(db,'select * from chain_private.deployments where id=$1',[this.deploymentId]);
    requireThat(r?.mode === 'MOCK',503,'MockDeploymentRequired');
    requireThat(BigInt(r.reward_amount)===100000000n && r.network_id.toString('hex')===createHash('sha256').update('Test SDF Network ; September 2015').digest('hex'),503,'UnsupportedDevConfiguration');
    return { deploymentId: r.id, mode:'MOCK', schemaVersion:1, networkId:r.network_id.toString('hex'),
      contractAddress:r.contract_address, admin:r.admin, service:r.service, rewardToken:r.reward_token, rewardAmount:BigInt(r.reward_amount) };
  }
  async mock(db: Db): Promise<MockStellarService> {
    const row = await one(db,'select snapshot from api_private.mock_runtime where deployment_id=$1 for update',[this.deploymentId]);
    requireThat(row,503,'MockNotProvisioned'); return MockStellarService.fromSnapshot(await this.config(db),row.snapshot);
  }
  async saveMock(db: Db, mock: MockStellarService): Promise<void> {
    await db.query('update api_private.mock_runtime set snapshot=$2,revision=revision+1 where deployment_id=$1',[this.deploymentId,Buffer.from(mock.exportSnapshot())]);
  }
  async view(db: Db, batteryId: string): Promise<Record<string, unknown>> {
    const exists = await one(db,'select 1 from app_private.battery_records where deployment_id=$1 and battery_id=$2',[this.deploymentId,batteryId]);
    requireThat(exists,404,'BatteryNotFound');
    const battery = await one(db,'select state,reward_state from chain_private.batteries where deployment_id=$1 and battery_id=$2',[this.deploymentId,batteryId]);
    const pending = await one(db,`select id,state,command from app_private.stellar_operations where deployment_id=$1 and battery_id=$2
      and state in ('QUEUED','AWAITING_AUTH','READY','SUBMITTED','UNKNOWN') order by created_at desc limit 1`,[this.deploymentId,batteryId]);
    const attempt = await one(db,`select state,attempt_number,error_code from app_private.reward_attempts where deployment_id=$1 and battery_id=$2 order by attempt_number desc limit 1`,[this.deploymentId,batteryId]);
    return { batteryId, confirmedBatteryState:battery?.state ?? null, confirmedRewardState:battery?.reward_state ?? null,
      pendingOperation:pending ?? null, lastAttempt:attempt ?? null, source:'MOCK' };
  }
  async project(db: Db, mock: MockStellarService, command: Command, ledger: number): Promise<void> {
    const d=this.deploymentId;
    if(command.kind==='set_role') {
      await db.query(`insert into chain_private.actor_roles values($1,$2,$3,$4,$5) on conflict(deployment_id,actor_address,role)
        do update set enabled=excluded.enabled,confirmed_ledger=excluded.confirmed_ledger`,[d,command.actor,command.role,command.enabled,ledger]); return;
    }
    const b=await mock.getBattery(d,command.batteryId); requireThat(b,500,'ProjectionMissing');
    if('requestId' in command) {
      const r=await mock.getReturnRequest(d,command.requestId); requireThat(r,500,'ProjectionMissing');
      await db.query(`insert into chain_private.return_requests values($1,decode($2,'hex'),$3,$4,$5,$6)
        on conflict(deployment_id,request_id) do update set state=excluded.state,confirmed_ledger=excluded.confirmed_ledger`,
        [d,command.requestId,r.batteryId,r.recipient,r.state,ledger]);
      if(r.state==='CONFIRMED') await db.query(`update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=coalesce(association_confirmed_at,now()) where deployment_id=$1 and request_id=decode($2,'hex') and reservation_state='HELD'`,[d,command.requestId]);
      if(r.state==='CANCELLED') await db.query(`update app_private.return_requests set reservation_state='RELEASED' where deployment_id=$1 and request_id=decode($2,'hex') and reservation_state='HELD'`,[d,command.requestId]);
    }
    await db.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,reward_state,confirmed_ledger)
      values($1,$2,$3,decode($4,'hex'),decode($5,'hex'),$6,decode($7,'hex'),$8,decode($9,'hex'),$10,$11)
      on conflict(deployment_id,battery_id) do update set state=excluded.state,request_id=excluded.request_id,collector=excluded.collector,collection_hash=excluded.collection_hash,
      recycler=excluded.recycler,recycling_hash=excluded.recycling_hash,reward_state=excluded.reward_state,confirmed_ledger=excluded.confirmed_ledger`,
      [d,command.batteryId,b.state,b.registrationHash,b.requestId,b.collector,b.collectionHash,b.recycler,b.recyclingHash,b.rewardState,ledger]);
  }
}
