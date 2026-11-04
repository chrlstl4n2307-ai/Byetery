import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {canonical} from '../application/validation.ts';
import {noSecrets} from './model.ts';
import {assertCommittedCloseReceipt,type CommittedCloseReceipt} from '../testnet/pre-dispatch-close.ts';
export function incidentCloseManifest(receipt:CommittedCloseReceipt){
  assertCommittedCloseReceipt(receipt);
  const body={schemaVersion:'BYETERY_D3_INCIDENT_CLOSE_V1',incidentSha:receipt.incidentSha,fixSha:receipt.fixSha,
    operationId:receipt.operationId,batteryId:receipt.batteryId,proofDigest:receipt.proofDigest,
    localState:'ABORTED_PRE_DISPATCH',logicalState:'CANCELLED_LOCAL',reason:'PreDispatchAborted',transactionHash:null,ledger:null,
    complete:false,counting:false,physicalSignerUse:'UNKNOWN',successfulBusinessTx:0};
  noSecrets(canonical(body));return {...body,sha256:createHash('sha256').update(canonical(body)).digest('hex')};
}
export async function writeIncidentCloseManifest(path:string,manifest:ReturnType<typeof incidentCloseManifest>){
  const {sha256,...body}=manifest;
  if(sha256!==createHash('sha256').update(canonical(body)).digest('hex'))throw Error('IncidentManifestChanged');
  noSecrets(canonical(manifest));await writeFile(path,canonical(manifest)+'\n',{flag:'wx',mode:0o600});
}
