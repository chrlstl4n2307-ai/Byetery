import { walletMessage } from '../wallet-message.ts';

export const TARGET = 'GCE35NEN2O3EYK5A7SROTLFOCSAIGLN2BPVQBFS4UG52BY2P7K6VC6DB';
export const WALLET_A = 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
export const DEPLOYMENT = '5c0cad2f-5f25-4216-8068-6cb9d2d26325';
export const NETWORK_ID = 'cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472';
export const PASSPHRASE = 'Test SDF Network ; September 2015';
export interface Challenge {
  challengeId: string; version: number; signingScheme: string; address: string;
  network: string; purpose: string; messageBase64: string; expiresAt: string; source: string;
}
export interface Profile { userId: string; source: string; wallets: {id:string;address:string;verifiedAt:string}[] }
export interface Provider {
  requestAccess(): Promise<{address:string;error?:unknown}>;
  getAddress(): Promise<{address:string;error?:unknown}>;
  getNetwork(): Promise<{networkPassphrase:string;error?:unknown}>;
  signMessage(message:string, options:{address:string}): Promise<{signedMessage:string|Uint8Array|null;signerAddress:string;error?:unknown}>;
}
function check(value: unknown): asserts value { if (!value) throw new Error('WalletBindingRejected'); }
export function signatureBase64(value: string|Uint8Array|null): string {
  const encoded = value instanceof Uint8Array ? btoa(Array.from(value,c=>String.fromCharCode(c)).join('')) : value;
  check(typeof encoded==='string' && /^[A-Za-z0-9+/]{86}==$/.test(encoded));
  const decoded=atob(encoded); check(decoded.length===64 && btoa(decoded)===encoded);
  return encoded;
}
/** Validation only: the existing backend remains the proof verifier and issuer. */
export function challengeText(c: Challenge, userId: string, now=Date.now()): string {
  check(c && c.address===TARGET && c.source==='TESTNET' && c.network==='Testnet' && c.purpose==='LINK_WALLET');
  check(c.version===2 && c.signingScheme==='SEP53_V2' && /^[0-9a-f-]{36}$/i.test(c.challengeId));
  const expires=Date.parse(c.expiresAt);
  check(Number.isFinite(expires) && expires>now && expires<=now+630000);
  check(typeof c.messageBase64==='string' && c.messageBase64.length<4096);
  const message=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(c.messageBase64),ch=>ch.charCodeAt(0)));
  const lines=message.split('\n'); check(lines.length===14);
  const nonce=lines[11]?.slice('Nonce: '.length);
  check(/^[0-9a-f]{64}$/.test(nonce) && !/^0+$/.test(nonce));
  check(message===walletMessage({deploymentId:DEPLOYMENT,id:c.challengeId,userId,networkId:NETWORK_ID,
    address:TARGET,nonce,expiresAt:c.expiresAt}));
  return message;
}
export async function selectedWallet(provider: Provider): Promise<void> {
  const address=await provider.getAddress(),network=await provider.getNetwork();
  check(!address.error && !network.error && address.address===TARGET && network.networkPassphrase===PASSPHRASE);
}
/** Called only by a separate explicit owner click, never during connect/challenge. */
export async function signChallenge(provider: Provider,c: Challenge,userId:string): Promise<string> {
  await selectedWallet(provider);
  const message=challengeText(c,userId);
  const result=await provider.signMessage(message,{address:TARGET});
  check(!result.error && result.signerAddress===TARGET);
  await selectedWallet(provider); challengeText(c,userId);
  return signatureBase64(result.signedMessage);
}
