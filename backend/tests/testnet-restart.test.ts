import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { localDb,harness } from './testnet-fixtures.ts';
import { TransportStore, type Sql } from '../src/testnet/store.ts';
import { LocalTransactionWorker } from '../src/testnet/worker.ts';
test('VOL-003 on-disk PostgreSQL reopen retains exact envelope/hash and reconciles without resubmit',async()=>{
  const location=fileURLToPath(new URL('../../.tools/vol003-restart-'+randomUUID()+'/',import.meta.url));
  const original=await localDb(location);
  let reopened:PGlite|undefined,originalClosed=false;
  try{
    const f=await harness(original);f.transport.loseSubmit=true;
    await f.worker.run(f.op,'original-process');const identity=(await f.store.identity(f.op))!;
    await original.close();originalClosed=true;reopened=new PGlite(location);const persistent=reopened;
    const store=new TransportStore({transaction:work=>persistent.transaction(async db=>{
      const sql:Sql={query:async <R>(s:string,p?:unknown[])=>({rows:(await db.query(s,p)).rows as R[]})};
      return work(sql);
    })});
    assert.deepEqual((await store.identity(f.op))!.envelopeBytes,identity.envelopeBytes);
    f.transport.success=true;
    const worker=new LocalTransactionWorker(store,f.transport,f.project);
    assert.equal(await worker.run(f.op,'new-process'),'PROJECTED');
    assert.equal(f.transport.prepareCount,1);assert.equal(f.transport.signCount,1);assert.equal(f.transport.submitted.length,1);
    assert.ok(f.transport.observed.every(h=>h===identity.transactionHash));
  }finally{
    if(!originalClosed)await original.close();await reopened?.close();
    // Ignored local fixture database retained; never contains live signing material.
  }
});
