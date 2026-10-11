import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Account, Contract, Keypair, Networks, StrKey, Transaction, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { config, h, recipient, collector, recycler } from './fixtures.ts';
import type { Command } from '../src/domain.ts';
import { TransportStore, type TransportDatabase, type Sql, type Work } from '../src/testnet/store.ts';
import { LocalTransactionWorker, type FixtureTransport } from '../src/testnet/worker.ts';
import { NETWORK_ID, type TransactionIdentity, type PreparedBody, type Observation, type StateEvidence, type FinalizedBody } from '../src/testnet/identity.ts';

export async function localDb(location?:string) {
  const db=new PGlite(location);
  await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;');
  const dir=new URL('../../database/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  return db;
}
export class FakeTransport implements FixtureTransport {
  readonly scope='LOCAL_FAKE' as const;
  readonly key: Keypair; readonly outside:()=>void;
  prepareCount=0;signCount=0;submitted:TransactionIdentity[]=[];observed:string[]=[];
  loseSubmit=false;outage=false;failChain=false;success=false;closeTime='1100';ledger=15;
  effect:StateEvidence['outcome']='UNRESOLVED';
  constructor(key:Keypair,outside:()=>void){this.key=key;this.outside=outside;}
  async prepareAndSimulate(w:Work):Promise<PreparedBody>{
    this.outside();this.prepareCount++;
    const args=w.argumentsXdr.map(a=>xdr.ScVal.fromXDR(a,'base64'));
    const tx=new TransactionBuilder(new Account(w.sourceAccount,'0'),{fee:'10000',networkPassphrase:Networks.TESTNET})
      .addOperation(new Contract(w.contractAddress).call(w.command.kind,...args)).setTimebounds(1000,1300).build();
    return {transactionXdr:tx.toXDR(),preparedLedger:1};
  }
  async attachSorobanAuthorization(p:PreparedBody){this.outside();return p;}
  async signEnvelope(p:FinalizedBody){
    this.outside();this.signCount++;const tx=new Transaction(p.transactionXdr,Networks.TESTNET);tx.sign(this.key);return tx.toXDR();
  }
  async validity(_identity:TransactionIdentity){this.outside();return {ledger:this.ledger,closeTime:this.closeTime};}
  async submit(i:TransactionIdentity){
    this.outside();this.submitted.push(i);if(this.loseSubmit)throw Error('synthetic lost response');
    return {transactionHash:i.transactionHash};
  }
  async observe(i:TransactionIdentity):Promise<Observation>{
    this.outside();this.observed.push(i.transactionHash);if(this.outage)throw Error('synthetic outage');
    return this.success||this.failChain?{status:this.success?'SUCCESS':'FAILED',confirmation:{transactionHash:i.transactionHash,
      observationLedger:this.ledger,confirmationLedger:12,resultXdr:'synthetic-result',resultMetaXdr:'synthetic-meta',
      events:[],sorobanResult:null,correlationId:'local-fixture'}}
      :{status:'NOT_FOUND',observationLedger:this.ledger,ledgerCloseTime:this.closeTime,correlationId:'local-fixture'};
  }
  async inspectExpiredEffect():Promise<StateEvidence>{this.outside();return {outcome:this.effect,stateReadLedger:this.ledger+1,evidence:'synthetic-authoritative-state',correlationId:'local-state-fixture'};}
}
export async function harness(db:PGlite, reward=false, sourceKey?:Keypair) {
  const d=randomUUID(),op=randomUUID(),u=randomUUID(),w=randomUUID();
  const battery='BYE-'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
  const key=sourceKey??Keypair.random();let inTransaction=0,projectionCount=0,projectionFails=false;
  const contractAddress=StrKey.encodeContract(randomBytes(32));
  // All fixtures are private, ephemeral PGlite databases, never remote Supabase.
  await db.query(`insert into chain_private.deployments(id,mode,network_id,contract_address,wasm_hash,schema_version,admin,service,reward_token,reward_amount)
    values($1,'TESTNET',decode($2,'hex'),$3,decode($4,'hex'),1,$5,$6,$7,100000000)`,[d,NETWORK_ID,contractAddress,h(1),config.admin,config.service,config.rewardToken]);
  await db.query('insert into auth.users values($1)',[u]);
  await db.query('insert into app_private.users(id,auth_user_id) values($1,$1)',[u]);
  await db.query('insert into app_private.battery_records(deployment_id,battery_id,created_by) values($1,$2,$3)',[d,battery,u]);
  if(reward){
    await db.query(`insert into app_private.wallet_links(id,deployment_id,network_id,user_id,address,proof_reference,verified_at) values($1,$2,decode($3,'hex'),$4,$5,'synthetic-proof',now())`,[w,d,NETWORK_ID,u,recipient]);
    await db.query(`insert into app_private.return_requests(deployment_id,request_id,battery_id,user_id,wallet_link_id,recipient_snapshot,reservation_state) values($1,decode($2,'hex'),$3,$4,$5,$6,'HELD')`,[d,h(10),battery,u,w,recipient]);
    await db.transaction(async tx=>{
      await tx.query(`insert into chain_private.return_requests(deployment_id,request_id,battery_id,recipient,state,confirmed_ledger) values($1,decode($2,'hex'),$3,$4,'CONFIRMED',1)`,[d,h(10),battery,recipient]);
      await tx.query(`insert into chain_private.batteries(deployment_id,battery_id,state,registration_hash,request_id,collector,collection_hash,recycler,recycling_hash,reward_state,confirmed_ledger)
        values($1,$2,'RECYCLED',decode($3,'hex'),decode($4,'hex'),$5,decode($3,'hex'),$6,decode($3,'hex'),'PENDING',1)`,[d,battery,h(1),h(10),collector,recycler]);
      await tx.query("update app_private.return_requests set reservation_state='CONSUMED',association_confirmed_at=now() where deployment_id=$1",[d]);
    });
  }
  const command:Command=reward?{kind:'pay_reward',batteryId:battery}:{kind:'register_battery',batteryId:battery,registrationHash:h(1)};
  await db.query(`insert into app_private.stellar_operations(id,deployment_id,principal,idempotency_key,command,battery_id,parameters,parameters_hash)
    values($1::uuid,$2,'fixture',$1::text,$3,$4,$5,decode($6,'hex'))`,[op,d,command.kind,battery,JSON.stringify(command),h(1)]);
  if(reward)await db.query(`insert into app_private.reward_attempts(deployment_id,battery_id,request_id,operation_id,attempt_number) values($1,$2,decode($3,'hex'),$4,1)`,[d,battery,h(10),op]);
  const adapter:TransportDatabase={transaction: async work=>db.transaction(async tx=>{
    inTransaction++;
    const sql:Sql={query:async <R>(s:string,p?:unknown[])=>({rows:(await tx.query(s,p)).rows as R[]})};
    try{return await work(sql);}finally{inTransaction--;}
  })};
  const store=new TransportStore(adapter);
  const args=[nativeToScVal(battery,{type:'string'}),...reward?[]:[nativeToScVal(Buffer.from(h(1),'hex'),{type:'bytes'})]].map(a=>a.toXDR('base64'));
  await store.queue(d,op,key.publicKey(),args);
  const transport=new FakeTransport(key,()=>{if(inTransaction)throw Error('External work inside SQL transaction');});
  const project=async(sql:Sql,work:Work)=>{
    if(projectionFails)throw Error('synthetic projection failure');
    if(reward){
      await sql.query("update chain_private.batteries set reward_state='SENT',confirmed_ledger=$3 where deployment_id=$1 and battery_id=$2",[d,battery,work.confirmation?.confirmationLedger??work.stateEvidence!.stateReadLedger]);
      await sql.query("update app_private.reward_attempts set state='SUCCEEDED' where operation_id=$1",[op]);
    }
    projectionCount++;
  };
  const worker=new LocalTransactionWorker(store,transport,project);
  return {d,op,battery,key,args,store,transport,worker,adapter,project,command,
    projectionCount:()=>projectionCount,failProjection:(v:boolean)=>{projectionFails=v;}};
}
