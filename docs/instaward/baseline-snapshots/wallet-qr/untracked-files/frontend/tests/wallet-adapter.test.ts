import { describe, it, expect, vi } from "vitest";
import {
  FreighterAdapter,
  challengeText,
  type FreighterProvider,
} from "@/lib/wallet-adapter";
import type { Challenge } from "@/lib/types";
import { walletMessage } from "../../backend/src/wallet-message";
const address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
export function challenge(): Challenge {
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  return {
    version: 2,
    signingScheme: "SEP53_V2",
    network: "Testnet",
    purpose: "LINK_WALLET",
    challengeId: "challenge",
    address,
    expiresAt,
    source: "MOCK",
    messageBase64: btoa(
      walletMessage({
        deploymentId: "deployment",
        id: "challenge",
        userId: "user",
        networkId: "ab".repeat(32),
        address,
        nonce: "cd".repeat(32),
        expiresAt,
      }),
    ),
  };
}
const signature = btoa(String.fromCharCode(...new Uint8Array(64))); // provider UI fixture only
function provider() {
  return {
    isConnected: vi.fn(async () => ({ isConnected: true })),
    requestAccess: vi.fn(async () => ({ address })),
    getAddress: vi.fn(async () => ({ address })),
    getNetwork: vi.fn(async () => ({
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
    })),
    signMessage: vi.fn(async () => ({
      signedMessage: signature,
      signerAddress: address,
    })),
  };
}
describe("Freighter adapter", () => {
  it("unavailable provider", async () => {
    const p = provider();
    p.isConnected.mockResolvedValue({ isConnected: false });
    await expect(
      new FreighterAdapter(async () => p).connect(),
    ).rejects.toMatchObject({ code: "Unavailable" });
    expect(p.requestAccess).not.toHaveBeenCalled();
  });
  it("provider load failure", async () =>
    expect(
      await new FreighterAdapter(async () => {
        throw Error();
      }).isAvailable(),
    ).toBe(false));
  it("connection accepted with correct address", async () =>
    expect(
      await new FreighterAdapter(async () => provider()).connect(),
    ).toEqual({ address }));
  it("connection rejection is normal cancellation", async () => {
    const p = {
      ...provider(),
      requestAccess: async () => ({
        address: "",
        error: { code: -4, message: "rejected" },
      }),
    };
    await expect(
      new FreighterAdapter(async () => p).connect(),
    ).rejects.toMatchObject({ code: "Cancelled" });
  });
  it("invalid address rejected", async () => {
    const p = provider();
    p.requestAccess.mockResolvedValue({ address: "invalid" });
    await expect(
      new FreighterAdapter(async () => p).connect(),
    ).rejects.toMatchObject({ code: "InvalidAddress" });
  });
  it("passes the exact decoded UTF8 message without prehash or base64 text", async () => {
    const p = provider(),
      c = challenge();
    expect(await new FreighterAdapter(async () => p).signChallenge(c)).toEqual({
      address,
      signatureBase64: signature,
    });
    expect(p.signMessage).toHaveBeenCalledWith(atob(c.messageBase64), {
      address,
    });
  });
  it("normalizes old provider Buffer transport without changing signing scheme", async () => {
    const p: FreighterProvider = {
      ...provider(),
      signMessage: async () => ({
        signedMessage: new Uint8Array(64),
        signerAddress: address,
      }),
    };
    expect(
      (await new FreighterAdapter(async () => p).signChallenge(challenge()))
        .signatureBase64,
    ).toBe(signature);
  });
  it("signature rejected by user", async () => {
    const p = {
      ...provider(),
      signMessage: async () => ({
        signedMessage: null,
        signerAddress: address,
        error: { code: -4 },
      }),
    };
    await expect(
      new FreighterAdapter(async () => p).signChallenge(challenge()),
    ).rejects.toMatchObject({ code: "Cancelled" });
  });
  it("malformed signature rejected", async () => {
    const p = provider();
    p.signMessage.mockResolvedValue({
      signedMessage: "bad",
      signerAddress: address,
    });
    await expect(
      new FreighterAdapter(async () => p).signChallenge(challenge()),
    ).rejects.toMatchObject({ code: "InvalidSignature" });
  });
  it("expired challenge rejected before signing", async () => {
    const p = provider();
    await expect(
      new FreighterAdapter(async () => p).signChallenge({
        ...challenge(),
        expiresAt: new Date(0).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "Expired" });
    expect(p.signMessage).not.toHaveBeenCalled();
  });
  it("no client downgrade to legacy", () =>
    expect(() =>
      challengeText({
        ...challenge(),
        signingScheme: "RAW_ED25519_V1",
      } as unknown as Challenge),
    ).toThrow());
  it("changed envelope/address rejected", () =>
    expect(() =>
      challengeText({ ...challenge(), challengeId: "other" }),
    ).toThrow());
  it("account change before signature rejected", async () => {
    const p = provider();
    p.getAddress.mockResolvedValue({ address: "G" + "A".repeat(55) });
    await expect(
      new FreighterAdapter(async () => p).signChallenge(challenge()),
    ).rejects.toMatchObject({ code: "AccountChanged" });
    expect(p.signMessage).not.toHaveBeenCalled();
  });
  it("account change after signature rejected", async () => {
    const p = provider();
    p.getAddress
      .mockResolvedValueOnce({ address })
      .mockResolvedValueOnce({ address: "G" + "A".repeat(55) });
    await expect(
      new FreighterAdapter(async () => p).signChallenge(challenge()),
    ).rejects.toMatchObject({ code: "AccountChanged" });
  });
  it("wrong signer response rejected", async () => {
    const p = provider();
    p.signMessage.mockResolvedValue({
      signedMessage: signature,
      signerAddress: "G" + "A".repeat(55),
    });
    await expect(
      new FreighterAdapter(async () => p).signChallenge(challenge()),
    ).rejects.toMatchObject({ code: "AccountChanged" });
  });
  it("incompatible network rejected without RPC", async () => {
    const p = provider();
    p.getNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });
    await expect(
      new FreighterAdapter(async () => p).connect(),
    ).rejects.toMatchObject({ code: "NetworkMismatch" });
  });
});
