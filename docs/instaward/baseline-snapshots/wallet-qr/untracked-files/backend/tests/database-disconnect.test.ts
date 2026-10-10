import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Repository } from '../src/application/repository.ts';
import type { Settings } from '../src/application/config.ts';

test('connection loss aborts without commit or replay; next transaction can succeed', async () => {
  const repo = new Repository({database:{},deploymentId:'test'} as Settings);
  const db = new EventEmitter() as EventEmitter & {query: (sql:string)=>Promise<unknown>; release:(destroy?:boolean)=>void};
  const queries:string[]=[]; const releases:(boolean|undefined)[]=[];
  db.query=async sql=>{queries.push(sql);return {rows:[]};};
  db.release=destroy=>{releases.push(destroy);};
  Object.defineProperty(repo.pool,'connect',{value:async()=>db});
  let calls=0;
  const failure=new Error('Connection terminated unexpectedly');
  try {
    await assert.rejects(repo.transaction(async()=>{calls++;db.emit('error',failure);return 'unsafe';}),failure);
    assert.equal(calls,1); assert.equal(queries.includes('commit'),false);
    assert.equal(releases[0],true); assert.equal(db.listenerCount('error'),0);
    assert.equal(await repo.transaction(async()=>42),42);
    assert.equal(releases[1],false);
  } finally {await repo.pool.end();}
});

test('idle pool disconnect is handled without an uncaught error', async () => {
  const repo=new Repository({database:{},deploymentId:'test'} as Settings);
  try { assert.doesNotThrow(()=>repo.pool.emit('error',new Error('disconnected'))); }
  finally {await repo.pool.end();}
});
