/** Signing is separate from simulation, persistence and submission. */
export interface SigningRequest {
  transactionXdr: string;
  networkPassphrase: string;
  currentLedger: number;
  expirationLedger: number;
  method: string;
  expectedSigners: string[];
}
export interface SigningResult { transactionXdr: string; signers: string[] }
export interface StellarSigner { sign(request: SigningRequest): Promise<SigningResult> }
