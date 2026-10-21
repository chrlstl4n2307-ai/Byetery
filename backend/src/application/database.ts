import type {Pool,PoolClient} from 'pg';
import {DomainError} from '../domain.ts';

/** Connection events are independent of query promises. Never log their payloads. */
export class DatabaseHealth {
  private epoch=0;
  private readonly watched=new WeakSet<PoolClient>();
  private readonly broken=new WeakSet<PoolClient>();
  constructor(pool:Pool){
    pool.on('connect',client=>this.watch(client));
    pool.on('error',(_error,client)=>{this.interrupt(client);});
  }
  watch(client:PoolClient){
    if(this.watched.has(client))return;
    this.watched.add(client);
    // Keep this listener for the client's whole lifetime, including checkout,
    // release and termination. pg-pool removes its own idle listener on acquire.
    client.on('error',()=>this.interrupt(client));
  }
  interrupt(client?:PoolClient){this.epoch++;if(client)this.broken.add(client);}
  isBroken(client:PoolClient){return this.broken.has(client);}
  guard():()=>void {
    const epoch=this.epoch;
    return ()=>{if(epoch!==this.epoch)throw new DomainError('DatabaseConnectionInterrupted');};
  }
}
const healthByPool=new WeakMap<Pool,DatabaseHealth>();
export function databaseHealth(pool:Pool){
  let health=healthByPool.get(pool);
  if(!health){health=new DatabaseHealth(pool);healthByPool.set(pool,health);}
  return health;
}
function connectionError(error:unknown){
  if(!(error instanceof Error))return false;
  const code=(error as NodeJS.ErrnoException).code??'';
  return /^(08|ECONN|ETIMEDOUT|EPIPE)/.test(code)||
    /Connection terminated|Client has encountered a connection error|Query read timeout|Connection terminated due to connection timeout/.test(error.message);
}
/** No reconnect/retry. COMMIT uncertainty is an error, never permission to send. */
export async function databaseTransaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>,lockTimeout:'5s'|'15s',deploymentId?:string):Promise<T>{
  const health=databaseHealth(pool),healthy=health.guard();
  let client:PoolClient;
  try{client=await pool.connect();health.watch(client);}
  catch(error){if(connectionError(error))health.interrupt();throw new DomainError('DatabaseConnectionInterrupted');}
  let destroy=false;
  try{
    healthy();
    await client.query('begin');healthy();
    await client.query(`set local lock_timeout='${lockTimeout}'`);healthy();
    if(deploymentId){await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[deploymentId]);healthy();}
    const result=await work(client);healthy();
    await client.query('commit');healthy();return result;
  }catch(error){
    destroy=health.isBroken(client)||connectionError(error);
    if(destroy){health.interrupt(client);throw new DomainError('DatabaseConnectionInterrupted');}
    try{await client.query('rollback');}catch{destroy=true;health.interrupt(client);}
    // A fault on another pooled connection also invalidates this attempt.
    healthy();throw error;
  }finally{client.release(destroy||health.isBroken(client));}
}
