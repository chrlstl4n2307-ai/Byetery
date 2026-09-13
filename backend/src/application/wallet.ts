import { randomBytes, randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import type { WalletVerifier, WalletChallenge, WalletVerification } from '../wallet-verifier.ts';
import { Repository, one, type Db } from './repository.ts';
import { failure, requireThat, type Reply } from './errors.ts';
import { bytes, object, text, uuid } from './validation.ts';
export class Ed25519WalletVerifier implements WalletVerifier {
  async verify(challenge: WalletChallenge, proof: Uint8Array, now: Date): Promise<WalletVerification> {
    if(now >= challenge.expiresAt) return {verified:false,reason:'EXPIRED'};
    try { if(proof.length===64 && Keypair.fromPublicKey(challenge.address).verify(Buffer.from(challenge.message),Buffer.from(proof)))
      return {verified:true,address:challenge.address,networkId:challenge.networkId,challengeId:challenge.id}; }
    catch { /* Invalid addresses/proofs are normal validation failures. */ }
    return {verified:false,reason:'INVALID_PROOF'};
  }
}
export class WalletService {
  readonly repo: Repository; readonly verifier: WalletVerifier;
  constructor(repo: Repository, verifier: WalletVerifier = new Ed25519WalletVerifier()) { this.repo=repo;this.verifier=verifier; }
  async challenge(db: Db, user: string, input: unknown): Promise<Reply> {
    const body=object(input,['address']); const address=text(body.address,56);
    try { requireThat(address.startsWith('G'),400,'InvalidWallet'); Keypair.fromPublicKey(address); }
    catch { return failure(400,'InvalidWallet'); }
    const config=await this.repo.config(db); const id=randomUUID(),nonce=randomBytes(32), now=(await one(db,'select clock_timestamp() as now'))!.now as Date;
    const expires=new Date(now.getTime()+600000);
    const message=Buffer.from(JSON.stringify({domain:'byetery-dev',purpose:'LINK_WALLET',version:1,id,userId:user,
      network:'Testnet',networkId:config.networkId,address,nonce:nonce.toString('hex'),expiresAt:expires.toISOString()}));
    await db.query(`insert into api_private.wallet_challenges(id,deployment_id,user_id,network_id,address,nonce,purpose,message_bytes,created_at,expires_at)
      values($1,$2,$3,decode($4,'hex'),$5,$6,'LINK_WALLET',$7,$8,$9)`,[id,this.repo.deploymentId,user,config.networkId,address,nonce,message,now,expires]);
    return {status:201,body:{challengeId:id,address,network:'Testnet',purpose:'LINK_WALLET',messageBase64:message.toString('base64'),expiresAt:expires.toISOString(),source:'MOCK'}};
  }
  async verify(db: Db, user: string, input: unknown): Promise<Reply> {
    const body=object(input,['challengeId','signature']); const id=uuid(body.challengeId),proof=bytes(body.signature,64);
    const row=await one(db,'select *,clock_timestamp() as now from api_private.wallet_challenges where deployment_id=$1 and id=$2 and user_id=$3 for update',[this.repo.deploymentId,id,user]);
    requireThat(row,404,'ChallengeNotFound');
    if(row.consumed_at || row.attempts>=5 || row.now>=row.expires_at) return failure(409,'ChallengeUnavailable');
    const challenge: WalletChallenge={id,userId:user,networkId:row.network_id.toString('hex'),address:row.address,
      domain:'byetery-dev',nonce:row.nonce.toString('hex'),message:row.message_bytes,expiresAt:row.expires_at};
    const result=await this.verifier.verify(challenge,proof,row.now);
    const valid=result.verified && result.challengeId===id && result.address===row.address && result.networkId===challenge.networkId;
    await db.query('update api_private.wallet_challenges set attempts=attempts+1,consumed_at=case when $3 then $4::timestamptz else null end where deployment_id=$1 and id=$2',[this.repo.deploymentId,id,valid,row.now]);
    if(!valid) return failure(422,'InvalidWalletProof');
    let link=await one(db,'select id from app_private.wallet_links where deployment_id=$1 and user_id=$2 and address=$3 and revoked_at is null',[this.repo.deploymentId,user,row.address]);
    if(!link) link=await one(db,`insert into app_private.wallet_links(deployment_id,network_id,user_id,address,proof_reference,verified_at)
      values($1,$2,$3,$4,$5,$6) returning id`,[this.repo.deploymentId,row.network_id,user,row.address,id,row.now]);
    return {status:200,body:{walletLinkId:link!.id,address:row.address,verified:true,source:'MOCK'}};
  }
}
