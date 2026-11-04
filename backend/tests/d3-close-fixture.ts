import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import type {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {Keypair} from '@stellar/stellar-sdk';
import {localDb,FakeTransport} from './testnet-fixtures.ts';
import {TransportStore,type Sql,type TransportDatabase} from '../src/testnet/store.ts';
import {DurableTransactionWorker} from '../src/testnet/worker.ts';
import {ACTORS,CONTRACT,TOKEN,WASM,invocation} from '../src/testnet/abi.ts';
import {NETWORK_ID,type TransactionIdentity} from '../src/testnet/identity.ts';
import {canonical} from '../src/application/validation.ts';
import {Repository} from '../src/application/repository.ts';
import {INCIDENT,verifyClosureEvidence,type ClosureReader,type ClosureReview} from '../src/testnet/closure-proof.ts';
import {closeReviewedRegistration} from '../src/testnet/pre-dispatch-close.ts';
export {INCIDENT};
export function pgliteAdapter(db:PGlite):TransportDatabase{
  return {transaction:work=>db.transaction(tx=>work({query:async<T>(sql:string,params?:unknown[])=>({rows:(await tx.query<T>(sql,params)).rows})}))};
}
export function pglitePool(db:PGlite){
  const pool=Object.assign(new EventEmitter(),{connect:async()=>Object.assign(new EventEmitter(),{query:async(sql:string,params?:unknown[])=>{
    const converted=sql.replace(/\$(\d+)\b/g,(v,n)=>params?.[Number(n)-1] instanceof Uint8Array?`decode(${v},'hex')`:v);
    const result=await db.query<Record<string,unknown>>(converted,params?.map(v=>v instanceof Uint8Array?Buffer.from(v).toString('hex'):v));
    return {...result,rows:result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Buffer.from(v):v])))};
  },release:()=>{}})}) as unknown as Pool;
  return pool;
}
export const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function seedIncident(db:Sql,adapter:TransportDatabase){
  const {deploymentId:d,operationId:op,batteryId:battery,source,baselineSequence}=INCIDENT;
  const user=randomUUID(),other=randomUUID(),session=randomUUID(),otherSession=randomUUID();
  await db.query('create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz)');
  await db.query('insert into auth.users values($1),($2)',[user,other]);
  await db.query('insert into auth.sessions values($1,$2,null),($3,$4,null)',[session,user,otherSession,other]);
  await db.query('insert into app_private.users(id,auth_user_id) values($1,$1),($2,$2)',[user,other]);
  await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
    values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[d,NETWORK_ID,CONTRACT,WASM,source,ACTORS.service,TOKEN]);
  await db.query("insert into api_private.memberships(deployment_id,user_id,role) values($1,$2,'ADMIN'),($1,$2,'USER'),($1,$3,'USER')",[d,user,other]);
  const raw=canonical({version:1,batteryId:battery,metadata:{fixture:true}}),registrationHash=sha(raw);
  const command={kind:'register_battery' as const,batteryId:battery,registrationHash},contextHash=sha(canonical(command));
  await db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[d,battery,user]);
  await db.query(`insert into app_private.evidence_versions(deployment_id,battery_id,kind,revision,format_version,manifest_bytes,payload_hash,object_path,created_by)
    values($1,$2,'REGISTRATION',1,1,convert_to($3,'UTF8'),decode($4,'hex'),'fixture-only',$5)`,[d,battery,raw,registrationHash,user]);
  const key='fixture-close-original';
  await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    values($1,$2,$3,$4,'register_battery',$5,$6,decode($7,'hex'))`,[op,d,user,key,battery,JSON.stringify(command),contextHash]);
  await db.query('insert into api_private.idempotency(deployment_id,user_id,key,input_hash,operation_id) values($1,$2,$3,decode($4,\'hex\'),$5)',[d,user,key,sha('fixture-original-input'),op]);
  const store=new TransportStore(adapter),args=invocation(command).args.map(v=>v.toXDR('base64'));
  await store.queue(d,op,source,args);
  const claim=await store.claim(op,'fixture-preparing');await store.preparing(claim);
  await store.prepared(claim,{resourceFee:'1',totalFee:'10001',authRequirements:[source],sourceSequence:baselineSequence,sourceBalance:'100',ledger:100});
  await store.release(claim);
  const review:ClosureReview={operationId:op,batteryId:battery,deploymentId:d,incidentSha:INCIDENT.incidentSha,contextHash,fixSha:'f1'.repeat(20),decisionId:'fixture-owner-decision',expiresAt:Date.now()+300000};
  const proofReader:ClosureReader={
    ownerDecision:async()=>({...review}),
    accounts:async()=>({networkId:NETWORK_ID,observedAt:Date.now(),rpc:{address:source,sequence:baselineSequence,balance:'100',ledger:200},horizon:{address:source,sequence:baselineSequence,balance:'100',ledger:200}}),
    history:async()=>({source,coveredSince:INCIDENT.startedAt,throughLedger:200,transactions:[],operations:[]}),
    effect:async()=>({batteryId:battery,contract:CONTRACT,wasm:WASM,ledger:200,status:'ABSENT_PROVEN',basis:'BASELINE_AND_COMPLETE_HISTORY'}),
    quiescence:async()=>({leaseGeneration:(await db.query<{generation:string}>('select generation::text from api_private.testnet_source_leases')).rows[0].generation,workers:0,helpers:0,activeLeases:0,artifacts:[],externalSourceUse:'QUIESCENT',observedAt:Date.now()}),
  };
  const identity:TransactionIdentity={deploymentId:d,operationId:op,networkId:NETWORK_ID,contractAddress:CONTRACT,sourceAccount:source,
    sequence:'20970216477425673',envelopeBytes:Buffer.from([1]),transactionHash:sha('fixture identity'),contextHash,minTime:'1',maxTime:'500',authorizationExpirations:[],preparedLedger:100};
  let projections=0;
  const transport=new FakeTransport(Keypair.random(),()=>{});
  const worker=new DurableTransactionWorker(store,transport,async()=>{projections++;});
  const getProof=(overrides:Partial<ClosureReader>={},reviewOverrides:Partial<ClosureReview>={})=>verifyClosureEvidence({...review,...reviewOverrides},{...proofReader,...overrides});
  return {d,op,battery,user,other,session,otherSession,key,store,claim,args,command,adapter,review,proofReader,getProof,identity,transport,worker,projections:()=>projections,
    close:async()=>closeReviewedRegistration(adapter,await getProof()),db};
}
export async function incidentFixture(){
  const db=await localDb();
  try{
    const f=await seedIncident(db,pgliteAdapter(db)),pool=pglitePool(db);
    const repo=Object.assign(Object.create(Repository.prototype) as Repository,{pool,deploymentId:f.d,mode:'TESTNET'});
    return {...f,repo,pg:db};
  }catch(error){await db.close();throw error;}
}
