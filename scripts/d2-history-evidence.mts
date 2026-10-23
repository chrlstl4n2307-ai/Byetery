/** Fixed D1 fixture; SQL/RPC reads only. Never start the generic API worker. */
import { writeFile } from 'node:fs/promises';
import pg from '../backend/node_modules/pg/lib/index.js';
import { settings } from '../backend/src/application/config.ts';
import { batteryHistory } from '../backend/src/history/read.ts';
import { HISTORY_DEPLOYMENT_ID } from '../backend/src/history/model.ts';
import { RpcHistoryReader } from '../backend/src/history/verify.ts';

const { Pool }=pg;
const batteryId='BYE-W1-002-64257020134D4A0F';
let pool:InstanceType<typeof Pool> | undefined;
try {
  const config=await settings();
  pool=new Pool({...config.database,max:1,application_name:'byetery-d2-003-evidence',options:'-c default_transaction_read_only=on'});
  const db=await pool.connect();
  let identity:{authUserId:string;sessionId:string};
  try {
    await db.query('begin read only');
    // The historical request owner is USER-1. Never select USER2 or create a session/principal.
    const row=(await db.query(`select u.auth_user_id as "authUserId",s.id as "sessionId"
      from app_private.return_requests r join app_private.users u on u.id=r.user_id
      join auth.sessions s on s.user_id=u.auth_user_id
      where r.deployment_id=$1 and r.battery_id=$2 and u.status='ACTIVE'
        and (s.not_after is null or s.not_after>now())
      order by r.created_at desc,s.id limit 1`,[HISTORY_DEPLOYMENT_ID,batteryId])).rows[0];
    if (!row) throw Error('ExistingUser1SessionRequired');
    identity=row;
    await db.query('rollback');
  } finally { db.release(); }
  const history=await batteryHistory({pool,deploymentId:HISTORY_DEPLOYMENT_ID,mode:'TESTNET'},identity,batteryId,new RpcHistoryReader());
  const evidence={task:'D2-003',classification:'REAL PERSISTED SQL + INDEPENDENT READ-ONLY TESTNET RPC',
    authenticationEvidence:'Existing USER-1 live SQL session/principal checked; not an authenticated deployed browser/API login',
    history,newTransactions:0,newOperationalSignatures:0,newBroadcasts:0,newSupabaseRows:0,
    ownerAcceptance:{D1:'12/12',D2:'0/6',D3:'0/5'},
    limitation:'Bounded provider retention. A missing/unavailable receipt stays UNVERIFIED. No full lifecycle or environmental certification is inferred.'};
  await writeFile(new URL('../docs/instaward/d2/D2-003-TIMELINE.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n','utf8');
  console.log(JSON.stringify({task:'D2-003',batteryId,entries:history.entries.map(e=>({kind:e.kind,verification:e.verification,hash:e.transactionHash,ledger:e.ledger,reason:e.reason})),
    evidence:'docs/instaward/d2/D2-003-TIMELINE.json',newTransactions:0,newBroadcasts:0}));
} catch {
  console.error('D2-003 evidence unavailable. Check existing local SQL configuration and historical USER-1 session. No credentials printed.');
  process.exitCode=1;
} finally {await pool?.end();}
