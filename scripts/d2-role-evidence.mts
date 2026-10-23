/** D2-004: pinned deployment, SELECT-only SQL and unsigned getter simulations. */
import {writeFile} from 'node:fs/promises';
import pg from '../backend/node_modules/pg/lib/index.js';
import {settings} from '../backend/src/application/config.ts';
import {TestnetRpc} from '../backend/src/testnet/rpc.ts';
import {TestnetTransport} from '../backend/src/testnet/transport.ts';
import {ACTORS,CONTRACT} from '../backend/src/testnet/abi.ts';
import {HISTORY_DEPLOYMENT_ID} from '../backend/src/history/model.ts';
import {Address,xdr} from '../backend/node_modules/@stellar/stellar-sdk/lib/esm/index.js';

const user1='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
const aliases={ADMIN:ACTORS.admin,SERVICE:ACTORS.service,COLLECTOR:ACTORS.collector,RECYCLER:ACTORS.recycler,USER1:user1};
const {Pool}=pg;
let pool:InstanceType<typeof Pool>|undefined;
try {
 const cfg=await settings();
 pool=new Pool({...cfg.database,max:1,application_name:'byetery-d2-004-readonly',options:'-c default_transaction_read_only=on'});
 const db=await pool.connect();
 let memberships:unknown[],deployment:unknown;
 try {
  await db.query('begin read only');
  deployment=(await db.query(`select id,mode,contract_address,admin,service from chain_private.deployments where id=$1`,[HISTORY_DEPLOYMENT_ID])).rows[0];
  if(!deployment || (deployment as {contract_address:string}).contract_address!==CONTRACT)throw Error('DeploymentMismatch');
  // Restrict to existing application operators and historical USER1. Never inspect USER2.
  memberships=(await db.query(`with selected as (
    select distinct u.id,u.status,case
     when exists(select 1 from app_private.return_requests r where r.user_id=u.id and r.deployment_id=$1 and r.battery_id='BYE-W1-002-64257020134D4A0F') then 'USER1'
     when exists(select 1 from api_private.memberships m where m.user_id=u.id and m.deployment_id=$1 and m.role='ADMIN') then 'ADMIN'
     when exists(select 1 from api_private.memberships m where m.user_id=u.id and m.deployment_id=$1 and m.actor_address=$2) then 'COLLECTOR'
     else 'RECYCLER' end as alias
    from app_private.users u where exists(select 1 from api_private.memberships m where m.user_id=u.id and m.deployment_id=$1 and (m.role='ADMIN' or m.actor_address in ($2,$3)))
     or exists(select 1 from app_private.return_requests r where r.user_id=u.id and r.deployment_id=$1 and r.battery_id='BYE-W1-002-64257020134D4A0F')
   ) select s.alias,s.status as principal_status,m.role,m.enabled,m.deployment_id,m.actor_address
     from selected s join api_private.memberships m on m.user_id=s.id and m.deployment_id=$1
     order by s.alias,s.status,m.role,m.enabled`,[HISTORY_DEPLOYMENT_ID,ACTORS.collector,ACTORS.recycler])).rows;
  await db.query('rollback');
 } finally {db.release();}
 const rpc=new TestnetRpc(async(url,init)=>{
  const method=JSON.parse(String(init?.body)).method;
  if(!['getNetwork','getLatestLedger','getLedgerEntries','simulateTransaction'].includes(method))throw Error('ReadOnlyRpcRequired');
  return fetch(url,init);
 });
 await rpc.network();
 // Only the existing getter implementation is used. No service/worker/signer is constructed.
 const reader=Object.assign(Object.create(TestnetTransport.prototype) as TestnetTransport,{rpc,deploymentId:HISTORY_DEPLOYMENT_ID});
 const config=await reader.read('get_config');
 const roles=[];
 for(const [alias,address] of Object.entries(aliases)){
  const actual:Record<string,boolean>={};let ledger=0;
  for(const role of ['Collector','Recycler']){
   const result=await reader.read('has_role',[new Address(address).toScVal(),xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(role)])]);
   if(typeof result.value!=='boolean')throw Error('InvalidRoleRead');
   actual[role]=result.value;ledger=result.ledger;
  }
  const returnedRole=actual.Collector&&actual.Recycler?'COLLECTOR+RECYCLER':actual.Collector?'COLLECTOR':actual.Recycler?'RECYCLER':'NONE';
  const expectedRole=alias==='COLLECTOR'||alias==='RECYCLER'?alias:'NONE';
  roles.push({alias,address,expectedRole,returnedRole,ledger,result:returnedRole===expectedRole?'PASS':'MISMATCH'});
 }
 const out={task:'D2-004',checkedAt:new Date().toISOString(),classification:'READ-ONLY OBSERVATION',deployment,memberships,
  contractGetter:'has_role(address, ActorRole) -> bool; no get_role exists in frozen ABI',
  config:{admin:config.value.admin,service:config.value.service,ledger:config.ledger,
    result:config.value.admin===ACTORS.admin&&config.value.service===ACTORS.service?'PASS':'MISMATCH'},roles,
  newTransactions:0,newSignatures:0,newBroadcasts:0,remoteWrites:0};
 await writeFile(new URL('../docs/instaward/d2/D2-004-ROLE-READS.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(out));
}catch(error){console.error('D2-004 read-only observation failed: '+(error instanceof Error&&/^[A-Za-z0-9_]+$/.test(error.message)?error.message:'ProviderOrConfigurationUnavailable'));process.exitCode=1;}
finally {await pool?.end();}
