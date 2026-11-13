import { verifyFreshD324Scopes } from '../d3-24-ratification/capture.mjs';
import { RUN1 } from '../d3-24-ratification/identity.mjs';
import { prepareCompositionSessions } from '../d3-24-composition/session-wrapper.mjs';

// No CLI, environment activation, credentials, authority keys or transport are
// supplied by this module. Only the isolated fixture driver calls it.
const check = (ok, code) => { if (!ok) throw Error(code); };
const methods = Object.freeze(['register_battery','open_return','confirm_collection','confirm_recycling','pay_reward']);
const scope = Object.freeze({taskId:RUN1.taskId,operatorSha:RUN1.businessSha,planHash:RUN1.planHash,
  batteryId:RUN1.batteryId,recipient:RUN1.recipient});
const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;

/** Candidate orchestration, deliberately confined to synthetic execution.
 * Production adapters, admission markers and LIVE entrypoints are not enabled.
 * A failed/uncertain admission or step consumes this instance; there is no retry.
 */
export async function prepareOfflineController({classification, sessionOptions, localControl, port}) {
  check(classification==='OFFLINE_SYNTHETIC' && port.classification===classification,'OFFLINE_ONLY');
  let phase;
  try {
    await localControl.verify();
    phase=await prepareCompositionSessions(sessionOptions);
  } catch(error) {
    await port.close();throw error;
  }
  let started=false, closed=false, closePromise;
  const confirmed=[];
  async function close() {
    closed=true;
    return closePromise ??= (async()=>{
      try { await port.close(); } finally { await phase.close(); }
    })();
  }
  return Object.freeze({
    summary:Object.freeze({classification,taskId:RUN1.taskId,identityDigest:phase.summary.identityDigest,
      businessAuthority:false,liveAuthority:false}),
    async execute(syntheticApproval) {
      check(!started&&!closed,'OFFLINE_CONTROLLER_CONSUMED');started=true;
      try {
        await localControl.verify();
        // The server independently verifies synthetic signatures and revalidates
        // all four sessions. This object/summary never grants production authority.
        await phase.admit(syntheticApproval);
        const bindings=phase.operatorBindings(port.proofFor);
        await bindings.d324Proofs.assertAdmission(scope);
        await port.start(bindings);
        for(const method of methods) {
          await localControl.verify();
          await bindings.d324Proofs.assertAdmission(scope);
          const result=await port.step(method);
          check(!closed,'OFFLINE_CONTROLLER_CLOSED');
          check(result?.method===method && id.test(result.operationId) && hex.test(result.transactionHash),
            'OFFLINE_OPERATION_IDENTITY_REJECTED');
          await verifyFreshD324Scopes([...confirmed,result]);
          const reconciled=await port.reconcile(result);
          check(reconciled==='CONFIRMED','OFFLINE_ORIGINAL_UNRESOLVED');
          const captured=await port.capture(result);
          check(!closed,'OFFLINE_CONTROLLER_CLOSED');
          check(captured.classification===classification && captured.chainVerified===false &&
            captured.grantsExecutionAuthority===false,'OFFLINE_CAPTURE_CLASSIFICATION_REJECTED');
          confirmed.push(Object.freeze({...result}));
        }
        return Object.freeze({status:'OFFLINE_COMPLETE',confirmed:Object.freeze([...confirmed]),
          classification,liveAuthority:false,realTransactions:0});
      } finally { await close(); }
    },
    close,
  });
}

/** Crash recovery has no submission or admission port. The caller must supply
 * the durable original identity. UNKNOWN remains unresolved, never replacement.
 */
export async function reconcileOfflineOriginal(original,{classification,read}) {
  check(classification==='OFFLINE_SYNTHETIC'&&id.test(original?.operationId)&&hex.test(original?.transactionHash),
    'OFFLINE_ORIGINAL_IDENTITY_REQUIRED');
  const result=await read(Object.freeze({...original}));
  check(result?.operationId===original.operationId&&result.transactionHash===original.transactionHash,
    'OFFLINE_OPERATION_IDENTITY_REJECTED');
  return result.confirmed===true?'CONFIRMED':'UNRESOLVED';
}
