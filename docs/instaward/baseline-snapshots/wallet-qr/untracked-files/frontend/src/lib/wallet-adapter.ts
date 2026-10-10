import type { Challenge } from "./types";
import { walletMessage } from "../../../backend/src/wallet-message";
export interface WalletConnection {
  address: string;
}
export interface WalletSignature {
  address: string;
  signatureBase64: string;
}
export interface WalletAdapter {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  connect(): Promise<WalletConnection>;
  signChallenge(challenge: Challenge): Promise<WalletSignature>;
}
type ProviderError = { code?: number; message?: string };
export interface FreighterProvider {
  isConnected(): Promise<{ isConnected: boolean; error?: ProviderError }>;
  requestAccess(): Promise<{ address: string; error?: ProviderError }>;
  getAddress(): Promise<{ address: string; error?: ProviderError }>;
  getNetwork(): Promise<{
    network: string;
    networkPassphrase: string;
    error?: ProviderError;
  }>;
  signMessage(
    message: string,
    options: { address: string },
  ): Promise<{
    signedMessage: string | Uint8Array | null;
    signerAddress: string;
    error?: ProviderError;
  }>;
}
export class WalletError extends Error {
  constructor(readonly code: string) {
    super(
      (
        {
          Unavailable:
            "Freighter no está disponible. Instala o habilita la extensión en este navegador.",
          Cancelled:
            "Solicitud cancelada en la wallet. Puedes volver a intentarlo.",
          InvalidAddress:
            "La wallet no entregó una dirección Stellar G válida.",
          AccountChanged:
            "La cuenta cambió durante la firma. Conecta de nuevo la dirección que quieres vincular.",
          NetworkMismatch:
            "Selecciona Testnet en Freighter para esta demostración. No se enviarán transacciones.",
          Expired: "El desafío caducó. Solicita uno nuevo.",
          InvalidChallenge:
            "El desafío no es compatible con Byetery SEP-53. Solicita uno nuevo.",
          InvalidSignature: "La wallet no devolvió una firma válida.",
          ProviderFailure:
            "La wallet no respondió correctamente. Vuelve a intentarlo desde la extensión.",
        } as Record<string, string>
      )[code] ?? "No pudimos completar la operación de wallet.",
    );
  }
}
function checked(error?: ProviderError) {
  if (error)
    throw new WalletError(
      error.code === -4 || /reject|denied|cancel/i.test(error.message ?? "")
        ? "Cancelled"
        : "ProviderFailure",
    );
}
function validAddress(address: string) {
  // The API additionally validates the StrKey checksum with the official SDK.
  if (address.length !== 56 || !/^G[A-Z2-7]{55}$/.test(address)) throw new WalletError("InvalidAddress");
}
export function challengeText(c: Challenge): string {
  if (
    c.version !== 2 ||
    c.signingScheme !== "SEP53_V2" ||
    c.source !== "MOCK" ||
    c.network !== "Testnet" ||
    c.purpose !== "LINK_WALLET"
  )
    throw new WalletError("InvalidChallenge");
  if (!Number.isFinite(Date.parse(c.expiresAt)))
    throw new WalletError("InvalidChallenge");
  if (Date.now() >= Date.parse(c.expiresAt)) throw new WalletError("Expired");
  validAddress(c.address);
  let message: string;
  try {
    message = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(c.messageBase64), (ch) => ch.charCodeAt(0)),
    );
  } catch {
    throw new WalletError("InvalidChallenge");
  }
  const lines = message.split("\n");
  if (
    lines.length !== 14 ||
    lines[0] !== "Byetery - Verify wallet control" ||
    lines[1] !== "Domain: byetery-dev" ||
    lines[2] !== "Purpose: LINK_WALLET" ||
    lines[3] !== "Version: 2" ||
    lines[4] !== "Signing scheme: SEP53_V2" ||
    lines[6] !== `Challenge: ${c.challengeId}` ||
    lines[8] !== "Network: Testnet" ||
    lines[10] !== `Address: ${c.address}` ||
    lines[12] !== `Expires at: ${c.expiresAt}` ||
    message.includes("\r")
  )
    throw new WalletError("InvalidChallenge");
  try {
    const field = (index: number, label: string) => {
      if (!lines[index].startsWith(label)) throw new Error();
      return lines[index].slice(label.length);
    };
    if (
      walletMessage({
        deploymentId: field(5, "Deployment: "),
        id: c.challengeId,
        userId: field(7, "User: "),
        networkId: field(9, "Network ID: "),
        address: c.address,
        nonce: field(11, "Nonce: "),
        expiresAt: c.expiresAt,
      }) !== message
    )
      throw new Error();
  } catch {
    throw new WalletError("InvalidChallenge");
  }
  return message;
}
export class FreighterAdapter implements WalletAdapter {
  readonly name = "Freighter";
  constructor(
    private readonly load: () => Promise<FreighterProvider> = () =>
      import("@stellar/freighter-api"),
  ) {}
  async isAvailable() {
    try {
      const r = await (await this.load()).isConnected();
      return !r.error && r.isConnected;
    } catch {
      return false;
    }
  }
  async connect() {
    if (!(await this.isAvailable())) throw new WalletError("Unavailable");
    const p = await this.load();
    let result;
    try {
      result = await p.requestAccess();
    } catch {
      throw new WalletError("ProviderFailure");
    }
    checked(result.error);
    validAddress(result.address);
    await this.network(p);
    return { address: result.address };
  }
  private async network(p: FreighterProvider) {
    const r = await p.getNetwork();
    checked(r.error);
    if (r.networkPassphrase !== "Test SDF Network ; September 2015")
      throw new WalletError("NetworkMismatch");
  }
  async signChallenge(c: Challenge) {
    const message = challengeText(c),
      p = await this.load();
    const before = await p.getAddress();
    checked(before.error);
    if (before.address !== c.address) throw new WalletError("AccountChanged");
    await this.network(p);
    const signed = await p.signMessage(message, { address: c.address });
    checked(signed.error);
    const after = await p.getAddress();
    checked(after.error);
    await this.network(p);
    if (after.address !== c.address || signed.signerAddress !== c.address)
      throw new WalletError("AccountChanged");
    if (Date.now() >= Date.parse(c.expiresAt)) throw new WalletError("Expired");
    const signature =
      typeof signed.signedMessage === "string"
        ? signed.signedMessage
        : signed.signedMessage instanceof Uint8Array &&
            signed.signedMessage.length === 64
          ? btoa(
              Array.from(signed.signedMessage, (b) =>
                String.fromCharCode(b),
              ).join(""),
            )
          : "";
    if (signature.length !== 88 || !/^[A-Za-z0-9+/]{86}==$/.test(signature))
      throw new WalletError("InvalidSignature");
    return { address: c.address, signatureBase64: signature };
  }
}
