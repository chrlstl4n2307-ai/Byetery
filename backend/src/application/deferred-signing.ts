import type {PhasedStellarSigner} from '../stellar-signer.ts';

/** Composition boundary only: read-only restart never loads the signer module.
 * The existing implementation and Secure Store protocol are unchanged. */
export function deferredSigning(load:()=>Promise<PhasedStellarSigner>):PhasedStellarSigner{
  let port:Promise<PhasedStellarSigner>|undefined;
  const get=()=>port??=load();
  return {
    authorize:async request=>(await get()).authorize(request),
    signEnvelope:async(request,hash)=>(await get()).signEnvelope(request,hash),
  };
}
