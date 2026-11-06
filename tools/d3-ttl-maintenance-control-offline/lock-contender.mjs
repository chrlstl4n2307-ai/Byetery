import {readFileSync} from 'node:fs';
import {acquireLock,appendJournal,releaseLock} from './journal.mjs';
import {clean,check} from './core.mjs';
// Controlled child-process fixture, never a network or signing worker.
try{const input=clean(JSON.parse(readFileSync(process.argv[2],'utf8')));check(input.creation.mode==='SYNTHETIC_OFFLINE','SYNTHETIC_ONLY');const handle=acquireLock(input.directory);const result=appendJournal(input.directory,handle,input.creation,input.checkpoint,input.event);process.send?.({status:'RESERVED_AND_LOCK_HELD',checkpoint:result.checkpoint});process.on('message',message=>{if(message==='RELEASE'){releaseLock(handle);process.disconnect?.();}});}catch(e){process.send?.({status:'DENIED',code:e.code??'LOCK_TEST_STOP'});process.exitCode=2;process.disconnect?.();}
