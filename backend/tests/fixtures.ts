import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import type { Command, Deployment, Evidence } from '../src/domain.ts';
import { MockStellarService } from '../src/mock-stellar-service.ts';

export const address = (n: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32,n));
export const contract = (n: number) => StrKey.encodeContract(Buffer.alloc(32,n));
export const h = (n: number) => Buffer.alloc(32,n).toString('hex');
export const config: Deployment = {
 deploymentId: '11111111-1111-4111-8111-111111111111', mode:'MOCK', schemaVersion:1,
 networkId:createHash('sha256').update('Test SDF Network ; September 2015').digest('hex'),
 contractAddress:contract(1), admin:address(1), service:address(2), rewardToken:contract(2), rewardAmount:100_000_000n,
};
export const bid='BYE-000001', rid=h(10), collector=address(3), recycler=address(4), recipient=address(5);
export const evidence = (kind: Evidence['kind']='COLLECTION'): Evidence => ({version:1,batteryId:bid,requestId:rid,kind,payloadHash:h(20)});
export const collect = (): Command => ({kind:'confirm_collection',batteryId:bid,requestId:rid,collector,evidence:evidence()});
export const recycle = (): Command => ({kind:'confirm_recycling',batteryId:bid,requestId:rid,recycler,evidence:evidence('RECYCLING')});
export async function run(s: MockStellarService, command: Command, signers?: string[]) {
 const p=await s.prepare(config.deploymentId,command);
 const sub=await s.submit(p,(signers??p.requiredSigners).map(a=>s.authorize(p,a)));
 return s.settle(sub);
}
export async function opened() {
 const s=new MockStellarService(config);
 await run(s,{kind:'set_role',actor:collector,role:'COLLECTOR',enabled:true});
 await run(s,{kind:'set_role',actor:recycler,role:'RECYCLER',enabled:true});
 await run(s,{kind:'register_battery',batteryId:bid,registrationHash:h(1)});
 await run(s,{kind:'open_return',batteryId:bid,requestId:rid,recipient}); return s;
}
