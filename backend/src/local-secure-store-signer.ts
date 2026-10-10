import { spawn } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Keypair, Networks, Transaction, xdr, Address, scValToNative } from '@stellar/stellar-sdk';
import type { SigningRequest, SigningResult, StellarSigner } from './stellar-signer.ts';
import { DomainError } from './domain.ts';

export interface ProcessResult { exitCode: number|null; stdout: string; stderr: string }
export type SignerProcess = (input: string) => Promise<ProcessResult>;
const LIMIT=131072;
const actors={
  admin:'GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F',
  service:'GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX',
  collector:'GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V',
  recycler:'GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2',
};
const methods: Record<string,string[]>={register_battery:[actors.admin],open_return:[actors.service],cancel_return:[actors.service],
  confirm_collection:[actors.service,actors.collector],confirm_recycling:[actors.recycler],pay_reward:[actors.service]};
const same=(a:string[],b:string[])=>a.length===b.length&&[...a].sort().every((s,i)=>s===[...b].sort()[i]);
const equalBytes=(a:Uint8Array,b:Uint8Array)=>Buffer.from(a).equals(Buffer.from(b));
function fail(code: string): never {throw new DomainError(code);}

/** No shell, CLI arguments, RPC access, logging or credentials in child env. */
export function signerProcess(binary: string, timeoutMs=30000): SignerProcess {
  if(!path.isAbsolute(binary)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000) fail('InvalidSignerConfiguration');
  return input=>new Promise((resolve,reject)=>{
    if(Buffer.byteLength(input)>LIMIT) return reject(new DomainError('SignerInputTooLarge'));
    const env: NodeJS.ProcessEnv={};
    for(const name of ['SystemRoot','WINDIR','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','HOMEDRIVE','HOMEPATH'])
      if(process.env[name]) env[name]=process.env[name];
    const child=spawn(binary,[],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env});
    let stdout='',stderr='',size=0,done=false;
    const finish=(error?:DomainError,result?:ProcessResult)=>{if(done)return;done=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(result!);};
    const timer=setTimeout(()=>finish(new DomainError('SignerTimeout')),timeoutMs);
    const output=(target:'stdout'|'stderr',b:Buffer)=>{size+=b.length;if(size>LIMIT)return finish(new DomainError('SignerOutputTooLarge'));if(target==='stdout')stdout+=b.toString('utf8');else stderr+=b.toString('utf8');};
    child.stdout.on('data',b=>output('stdout',b));child.stderr.on('data',b=>output('stderr',b));
    child.on('error',()=>finish(new DomainError('SignerProcessFailed')));
    child.stdin.on('error',()=>finish(new DomainError('SignerProcessFailed')));
    child.on('close',exitCode=>finish(undefined,{exitCode,stdout,stderr}));
    child.stdin.end(input);
  });
}

export class LocalSecureStoreSigner implements StellarSigner {
  private readonly run: SignerProcess;
  constructor(run: SignerProcess) {this.run=run;}
  async sign(request: SigningRequest): Promise<SigningResult> {
    if(request.networkPassphrase!==Networks.TESTNET) fail('WrongNetwork');
    const expected=methods[request.method];
    if(!expected||!same(expected,request.expectedSigners)) fail('SignerNotAllowed');
    let unsigned: Transaction;
    try {unsigned=new Transaction(request.transactionXdr,Networks.TESTNET);}catch{fail('InvalidXdr');}
    const input=JSON.stringify({version:1,network_passphrase:Networks.TESTNET,transaction_xdr:request.transactionXdr,
      current_ledger:request.currentLedger,signature_expiration_ledger:request.expirationLedger});
    let response: ProcessResult;
    try {response=await this.run(input);}catch(e){if(e instanceof DomainError)throw e;fail('SignerProcessFailed');}
    // Do not print or propagate helper output, even on error. Only stable codes leave here.
    if(response.exitCode!==0) fail('SignerProcessFailed');
    if(response.stderr.trim()) fail('SignerUnexpectedStderr');
    if(Buffer.byteLength(response.stdout)>LIMIT) fail('SignerOutputTooLarge');
    let out: {status?:string;signed_xdr?:string;method?:string;signers?:string[]};
    try{out=JSON.parse(response.stdout);}catch{fail('SignerInvalidOutput');}
    if(out.status!=='signed'||out.method!==request.method||!Array.isArray(out.signers)||!same(out.signers,expected)||typeof out.signed_xdr!=='string')fail('SignerInvalidOutput');
    let signed: Transaction;
    try{signed=new Transaction(out.signed_xdr,Networks.TESTNET);}catch{fail('SignerInvalidOutput');}
    if(signed.signatures.length!==1||signed.source!==expected[0]||signed.operations.length!==1||unsigned.operations.length!==1)fail('SignerInvalidOutput');
    const before=unsigned.toEnvelope(),after=signed.toEnvelope();
    if(before.type!=='envelopeTypeTx'||after.type!=='envelopeTypeTx')fail('SignerInvalidOutput');
    const bBody=before.v1.tx.operations[0].body,aBody=after.v1.tx.operations[0].body;
    if(bBody.type!=='invokeHostFunction'||aBody.type!=='invokeHostFunction')fail('SignerInvalidOutput');
    const beforeOp=bBody.invokeHostFunctionOp,afterOp=aBody.invokeHostFunctionOp;
    if(!equalBytes(beforeOp.hostFunction.toXDR(),afterOp.hostFunction.toXDR()))fail('SignerChangedTransaction');
    // All transaction fields except auth/signatures must remain byte-identical.
    const signedAuth=afterOp.auth;
    const comparable=after.v1.tx.toXdrObject();
    const comparableOp=comparable.operations[0].body;
    if(comparableOp.type!==24)fail('SignerInvalidOutput');
    comparableOp.invokeHostFunctionOp.auth=beforeOp.auth.map(a=>a.toXdrObject());
    if(!equalBytes(before.v1.tx.toXDR(),xdr.Transaction.fromXdrObject(comparable).toXDR()))fail('SignerChangedTransaction');
    const sig=signed.signatures[0];
    if(!Keypair.fromPublicKey(expected[0]).verify(signed.hash(),Buffer.from(sig.signature.toBytes())))fail('SignerInvalidSignature');
    if(beforeOp.auth.length!==signedAuth.length)fail('SignerChangedAuthorization');
    for(let i=0;i<signedAuth.length;i++) {
      const b=beforeOp.auth[i],a=signedAuth[i];
      if(!equalBytes(b.rootInvocation.toXDR(),a.rootInvocation.toXDR())||a.credentials.type!==b.credentials.type)fail('SignerChangedAuthorization');
      if(a.credentials.type==='sorobanCredentialsSourceAccount')continue;
      const c=a.credentials.type==='sorobanCredentialsAddress'?a.credentials.address:a.credentials.type==='sorobanCredentialsAddressV2'?a.credentials.addressV2:null;
      const original=b.credentials.type==='sorobanCredentialsAddress'?b.credentials.address:b.credentials.type==='sorobanCredentialsAddressV2'?b.credentials.addressV2:null;
      if(!c||!original||!equalBytes(c.address.toXDR(),original.address.toXDR())||c.nonce!==original.nonce||c.signatureExpirationLedger!==request.expirationLedger)fail('SignerChangedAuthorization');
      if(request.method!=='confirm_collection'||!equalBytes(c.address.toXDR(),new Address(actors.collector).toScAddress().toXDR()))fail('SignerChangedAuthorization');
      const values=scValToNative(c.signature);
      if(!Array.isArray(values)||values.length!==1||!values[0]||Object.keys(values[0]).sort().join(',')!=='public_key,signature')fail('SignerInvalidAuthSignature');
      const proof=values[0] as {public_key:Uint8Array;signature:Uint8Array};
      if(!(proof.public_key instanceof Uint8Array)||!(proof.signature instanceof Uint8Array)||proof.signature.length!==64)fail('SignerInvalidAuthSignature');
      const key=Keypair.fromPublicKey(actors.collector);
      if(!Buffer.from(proof.public_key).equals(key.rawPublicKey()))fail('SignerInvalidAuthSignature');
      const preimageFields={networkId:createHash('sha256').update(Networks.TESTNET).digest(),nonce:c.nonce,signatureExpirationLedger:c.signatureExpirationLedger,invocation:a.rootInvocation};
      const preimage=a.credentials.type==='sorobanCredentialsAddressV2'
        ?xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(new xdr.HashIdPreimageSorobanAuthorizationWithAddress({...preimageFields,address:c.address}))
        :xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization(preimageFields));
      if(!key.verify(createHash('sha256').update(preimage.toXDR()).digest(),Buffer.from(proof.signature)))fail('SignerInvalidAuthSignature');
    }
    return {transactionXdr:out.signed_xdr,signers:out.signers};
  }
}
