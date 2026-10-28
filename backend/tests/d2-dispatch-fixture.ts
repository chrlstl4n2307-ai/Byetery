import {Address,Keypair,Transaction,Networks,xdr} from '@stellar/stellar-sdk';
import {finalizedBody,signedIdentity} from '../src/testnet/identity.ts';
import {harness} from './testnet-fixtures.ts';
export type DispatchFixture=Awaited<ReturnType<typeof harness>>;

/** Synthetic address-auth entries test every stored expiry, not a real authorization. */
export async function signedReady(f:DispatchFixture,expirations:readonly number[]=[]){
 const c=await f.store.claim(f.op,'gap2b-sign-fixture');
 try{
  await f.store.preparing(c);const w=await f.store.work(f.op);
  let body=await f.transport.prepareAndSimulate(w);
  if(expirations.length){
   const tx=new Transaction(body.transactionXdr,Networks.TESTNET),env=tx.toEnvelope();
   if(env.type!=='envelopeTypeTx')throw Error('Fixture envelope');
   const op=env.v1.tx.operations[0].body;if(op.type!=='invokeHostFunction')throw Error('Fixture operation');
   const host=op.invokeHostFunctionOp.hostFunction;if(host.type!=='hostFunctionTypeInvokeContract')throw Error('Fixture invocation');
   op.invokeHostFunctionOp.auth.push(...expirations.map((expiration,index)=>new xdr.SorobanAuthorizationEntry({
    credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
     address:new Address(Keypair.random().publicKey()).toScAddress(),nonce:xdr.Int64.fromString(String(index+1)),signatureExpirationLedger:expiration,signature:xdr.ScVal.scvVoid()})),
    rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(host.invokeContract),subInvocations:[]})})));
   body={...body,transactionXdr:env.toXDR('base64')};
  }
  const final=finalizedBody(w,body),signed=await f.transport.signEnvelope(final),identity=signedIdentity(w,final,signed);
  await f.store.persist(c,identity);return identity;
 }finally{await f.store.release(c);}
}
