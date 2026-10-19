import { Account, Keypair, Networks, rpc, xdr } from '@stellar/stellar-sdk';
import { DomainError, ensure } from '../domain.ts';

export const TESTNET_RPC='https://soroban-testnet.stellar.org';
export type LatestLedger=Pick<rpc.Api.RawGetLatestLedgerResponse,'id'|'sequence'|'protocolVersion'|'closeTime'>;
export interface AccountObservation {account:Account;balance:string;ledger:number}
/** Fixed endpoint, bounded transport. Provider diagnostics/envelopes never escape errors. */
export class TestnetRpc {
  readonly transport:typeof fetch;
  constructor(transport:typeof fetch=fetch){this.transport=transport;}
  private async call<T>(method:string,params:object={}):Promise<T>{
    try {
      const response=await this.transport(TESTNET_RPC,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),redirect:'error'});
      ensure(response.ok&&response.body,'RpcUnavailable');
      const chunks:Uint8Array[]=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;ensure(size<=8*1024*1024,'RpcResponseTooLarge');chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      ensure(body.jsonrpc==='2.0'&&body.id===1&&!body.error&&body.result,'RpcRejected');
      return body.result as T;
    }catch(error){throw new DomainError((error instanceof DomainError?error.code:'RpcUnavailable')+'_'+method);}
  }
  async network(){const n=await this.call<rpc.Api.GetNetworkResponse>('getNetwork');ensure(n.passphrase===Networks.TESTNET,'WrongNetwork');return {passphrase:n.passphrase,protocolVersion:n.protocolVersion};}
  async latest():Promise<LatestLedger>{
    const l=await this.call<rpc.Api.RawGetLatestLedgerResponse>('getLatestLedger');
    ensure(Number.isSafeInteger(l.sequence)&&l.sequence>0&&/^\d+$/.test(l.closeTime),'InvalidLedger');
    // Do not retain metadataXdr/headerXdr: these can contain unrelated signed transactions.
    return {id:l.id,sequence:l.sequence,protocolVersion:l.protocolVersion,closeTime:l.closeTime};
  }
  entries(keys:readonly xdr.LedgerKey[]){ensure(keys.length>0&&keys.length<=32,'InvalidLedgerKeys');return this.call<rpc.Api.RawGetLedgerEntriesResponse>('getLedgerEntries',{keys:keys.map(k=>k.toXDR('base64'))});}
  async account(address:string):Promise<AccountObservation>{
    const key=xdr.LedgerKey.account(new xdr.LedgerKeyAccount({accountId:Keypair.fromPublicKey(address).xdrAccountId()}));
    const r=await this.entries([key]);const entry=r.entries?.find(e=>e.key===key.toXDR('base64'));
    ensure(entry,'SourceAccountUnavailable');const value=xdr.LedgerEntryData.fromXDR(entry.xdr,'base64');
    ensure(value.type==='account','InvalidAccount');
    return {account:new Account(address,value.account.seqNum.toString()),balance:value.account.balance.toString(),ledger:r.latestLedger};
  }
  simulate(transaction:string){return this.call<rpc.Api.RawSimulateTransactionResponse>('simulateTransaction',{transaction,authMode:'record'});}
  async send(transaction:string){
    const r=await this.call<rpc.Api.RawSendTransactionResponse>('sendTransaction',{transaction});
    ensure(['PENDING','DUPLICATE','TRY_AGAIN_LATER','ERROR'].includes(r.status)&&/^[0-9a-f]{64}$/.test(r.hash),'InvalidSubmitResponse');
    return {status:r.status,hash:r.hash,latestLedger:r.latestLedger};
  }
  async transaction(hash:string){ensure(/^[0-9a-f]{64}$/.test(hash),'InvalidTransactionHash');
    const r=await this.call<rpc.Api.RawGetTransactionResponse>('getTransaction',{hash});
    ensure(['SUCCESS','FAILED','NOT_FOUND'].includes(r.status),'InvalidTransactionResponse');
    // Intentionally omit envelopeXdr and diagnostic/auth material.
    return {status:r.status,txHash:r.txHash,ledger:r.ledger,createdAt:r.createdAt,latestLedger:r.latestLedger,
      latestLedgerCloseTime:r.latestLedgerCloseTime,resultXdr:r.resultXdr,resultMetaXdr:r.resultMetaXdr,
      events:r.events?.contractEventsXdr??[]};
  }
}
