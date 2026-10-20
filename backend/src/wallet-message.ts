/** Fixed UTF-8 wire format: ordered lines, LF separators, no BOM or trailing LF.
 * Values are server-issued ASCII identifiers. Never serialize an arbitrary object.
 */
export const WALLET_SIGNING_SCHEME = 'SEP53_V2' as const;
export type WalletSigningScheme = typeof WALLET_SIGNING_SCHEME | 'RAW_ED25519_V1';
export interface WalletMessageFields {
  deploymentId: string; id: string; userId: string; networkId: string;
  address: string; nonce: string; expiresAt: string;
}
export function walletMessage(fields: WalletMessageFields): string {
  for (const value of [fields.deploymentId,fields.id,fields.userId,fields.networkId,fields.address,fields.nonce,fields.expiresAt]) {
    if (!/^[A-Za-z0-9:.-]+$/.test(value)) throw new Error('InvalidWalletMessageField');
  }
  return [
    'Byetery - Verify wallet control',
    'Domain: byetery-dev',
    'Purpose: LINK_WALLET',
    'Version: 2',
    'Signing scheme: SEP53_V2',
    `Deployment: ${fields.deploymentId}`,
    `Challenge: ${fields.id}`,
    `User: ${fields.userId}`,
    'Network: Testnet',
    `Network ID: ${fields.networkId}`,
    `Address: ${fields.address}`,
    `Nonce: ${fields.nonce}`,
    `Expires at: ${fields.expiresAt}`,
    'This signature links your address to Byetery DEV. It does not authorize a transaction.',
  ].join('\n');
}
