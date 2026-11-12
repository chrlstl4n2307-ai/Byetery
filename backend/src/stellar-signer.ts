/** Signing is separate from simulation, persistence and submission. */
export interface KeyUseFence {
  schema:'BYETERY_D324_KEY_USE_V1';
  operationId:string;
  contextHash:string;
  instanceId:string;
  leaseGeneration:string;
  notAfter:number;
}
export interface SigningRequest {
  transactionXdr: string;
  networkPassphrase: string;
  currentLedger: number;
  expirationLedger: number;
  method: string;
  expectedSigners: string[];
  audit?: (phase:string)=>Promise<void>;
  assertAdmission?:()=>void;
  startAuthorized?:<T>(start:(assertStillValid:()=>void)=>Promise<T>)=>Promise<T>;
  withKeyUse?:<T>(use:(fence:KeyUseFence,assertStillValid:()=>void,revalidate:()=>Promise<void>)=>Promise<T>)=>Promise<T>;
  childObserver?:{started(pid:number):void;closed(pid:number):void};
}
export interface SigningResult { transactionXdr: string; signers: string[] }
export interface StellarSigner { sign(request: SigningRequest): Promise<SigningResult> }
/** Auth-only body must be finalized/hashed before the second call. */
export interface PhasedStellarSigner {
  authorize(request: SigningRequest): Promise<SigningResult>;
  signEnvelope(request: SigningRequest, expectedHash: string): Promise<SigningResult>;
}
