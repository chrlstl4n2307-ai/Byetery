import { randomUUID } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { Address as StellarAddress } from '@stellar/stellar-sdk';
import { batteryId, ensure, hash32, nonzeroHash, DomainError, type ActorRole, type Address, type Battery, type Command, type Deployment, type Evidence, type ReturnRequest } from './domain.ts';
import { evidenceCommitment } from './evidence.ts';
import type { Authorization, PreparedOperation, StellarService, Submission, TransactionResult } from './stellar-service.ts';

/** In-process test double. Mock proofs are NOT signatures and cannot authorize Testnet. */
export class MockStellarService implements StellarService {
  private readonly config: Deployment;
  private batteries = new Map<string, Battery>();
  private requests = new Map<string, ReturnRequest>();
  private roles = new Set<string>();
  private preparations = new Map<string, PreparedOperation>();
  private proofs = new Map<string, { preparationId: string; signer: string }>();
  private submissions = new Map<string, { prepared: PreparedOperation; result: TransactionResult }>();
  private archived = new Set<string>();
  private balance = 0n;
  private balances = new Map<string, bigint>();
  private ledger = 1;
  private rejectTransfer = false;
  private readonly now: () => number;
  constructor(config: Deployment, now: () => number = Date.now) {
    this.now = now;
    ensure(config.mode === 'MOCK', 'MockOnly');
    ensure(config.schemaVersion === 1 && config.rewardAmount > 0n && config.rewardAmount <= (1n << 127n) - 1n, 'InvalidConfiguration');
    hash32(config.networkId);
    for (const a of [config.contractAddress, config.admin, config.service, config.rewardToken]) StellarAddress.fromString(a);
    ensure(config.rewardToken !== config.contractAddress, 'InvalidConfiguration');
    this.config = structuredClone(config);
  }
  /** Server-only opaque snapshot for the local MOCK transport. Never accept client bytes. */
  exportSnapshot(): Uint8Array {
    return serialize({ version: 1, config: this.config, state: {
      batteries: this.batteries, requests: this.requests, roles: this.roles,
      preparations: this.preparations, proofs: this.proofs, submissions: this.submissions,
      archived: this.archived, balance: this.balance, balances: this.balances,
      ledger: this.ledger, rejectTransfer: this.rejectTransfer,
    } });
  }
  static fromSnapshot(config: Deployment, bytes: Uint8Array): MockStellarService {
    const saved = deserialize(bytes);
    ensure(saved?.version === 1 && saved.config &&
      Object.keys(config).every(k => saved.config[k] === config[k as keyof Deployment]), 'SnapshotDeploymentMismatch');
    const state = saved.state;
    ensure(state && ['batteries','requests','preparations','proofs','submissions','balances'].every(k => state[k] instanceof Map)
      && state.roles instanceof Set && state.archived instanceof Set && typeof state.balance === 'bigint'
      && Number.isSafeInteger(state.ledger) && state.ledger > 0, 'InvalidSnapshot');
    const mock = new MockStellarService(config);
    mock.batteries = state.batteries; mock.requests = state.requests; mock.roles = state.roles;
    mock.preparations = state.preparations; mock.proofs = state.proofs; mock.submissions = state.submissions;
    mock.archived = state.archived; mock.balance = state.balance; mock.balances = state.balances;
    mock.ledger = state.ledger; mock.rejectTransfer = state.rejectTransfer;
    return mock;
  }

  private scope(id: string) { ensure(id === this.config.deploymentId, 'DeploymentMismatch'); }
  async getConfig(id: string) { this.scope(id); return structuredClone(this.config); }
  async getBattery(id: string, bid: string) {
    this.scope(id); batteryId(bid); this.available(`b:${bid}`);
    return structuredClone(this.batteries.get(bid) ?? null);
  }
  async getReturnRequest(id: string, rid: string) {
    this.scope(id); hash32(rid); this.available(`r:${rid}`);
    return structuredClone(this.requests.get(rid) ?? null);
  }
  async hasRole(id: string, actor: Address, role: ActorRole) { this.scope(id); return this.roles.has(`${actor}:${role}`); }
  async getRewardBalance(id: string) { this.scope(id); return this.balance; }
  private signers(c: Command): string[] {
    switch (c.kind) {
      case 'register_battery': case 'set_role': return [this.config.admin];
      case 'confirm_collection': return [...new Set([c.collector, this.config.service])];
      case 'confirm_recycling': return [c.recycler];
      default: return [this.config.service];
    }
  }
  async prepare(id: string, command: Command): Promise<PreparedOperation> {
    this.scope(id);
    const p = { deploymentId: id, preparationId: randomUUID(), command: structuredClone(command), requiredSigners: this.signers(command), expiresAt: this.now() + 300_000 };
    this.preparations.set(p.preparationId, structuredClone(p)); return structuredClone(p);
  }
  /** Test harness only: issue an opaque proof bound to an immutable preparation. */
  authorize(prepared: PreparedOperation, signer: string): Authorization {
    this.original(prepared);
    const proof = `mock-proof:${randomUUID()}`;
    this.proofs.set(proof, { preparationId: prepared.preparationId, signer }); return { signer, proof };
  }
  private original(p: PreparedOperation) {
    this.scope(p.deploymentId);
    const stored = this.preparations.get(p.preparationId);
    ensure(stored && JSON.stringify(stored) === JSON.stringify(p), 'PreparationMismatch'); return stored;
  }
  async submit(p: PreparedOperation, auth: Authorization[]): Promise<Submission> {
    const original = this.original(p);
    const reference = `mock:${p.preparationId}`;
    for (const signer of original.requiredSigners) {
      ensure(auth.some(a => a.signer === signer && this.proofs.get(a.proof)?.signer === signer && this.proofs.get(a.proof)?.preparationId === p.preparationId), 'Unauthorized');
    }
    if (!this.submissions.has(reference)) {
      ensure(this.now() < original.expiresAt, 'AuthorizationExpired');
      this.submissions.set(reference, { prepared: structuredClone(original), result: { status: 'PENDING' } });
    }
    return { deploymentId: p.deploymentId, reference, source: 'MOCK' };
  }
  async getTransactionResult(s: Submission): Promise<TransactionResult> {
    this.scope(s.deploymentId); ensure(s.source === 'MOCK', 'MockOnly');
    return structuredClone(this.submissions.get(s.reference)?.result ?? { status: 'UNKNOWN' });
  }
  /** Explicit ledger advancement keeps pending application state separate from confirmation. */
  settle(s: Submission): TransactionResult {
    this.scope(s.deploymentId); ensure(s.source === 'MOCK', 'MockOnly');
    const entry = this.submissions.get(s.reference); ensure(entry, 'UnknownSubmission');
    if (entry.result.status !== 'PENDING') return structuredClone(entry.result);
    const snapshot = structuredClone({ batteries: this.batteries, requests: this.requests, roles: this.roles, balance: this.balance, balances: this.balances });
    try {
      ensure(this.now() < entry.prepared.expiresAt, 'AuthorizationExpired');
      entry.result = { status: 'SUCCESS', ledger: ++this.ledger, result: this.apply(entry.prepared.command) };
    } catch (e) {
      Object.assign(this, snapshot);
      entry.result = { status: 'FAILED', error: e instanceof DomainError ? e.code : 'InvalidInput' };
    }
    return structuredClone(entry.result);
  }
  fund(amount: bigint) { ensure(amount > 0n && this.balance + amount <= (1n << 127n) - 1n, 'InvalidAmount'); this.balance += amount; }
  recipientBalance(address: string) { return this.balances.get(address) ?? 0n; }
  failTransfers(enabled: boolean) { this.rejectTransfer = enabled; }
  archiveBattery(bid: string) { this.archived.add(`b:${bid}`); }
  archiveRequest(rid: string) { this.archived.add(`r:${rid}`); }
  restoreAll() { this.archived.clear(); }
  private available(key: string) { ensure(!this.archived.has(key), 'RestorationRequired'); }
  private battery(bid: string): Battery {
    batteryId(bid); this.available(`b:${bid}`); const b = this.batteries.get(bid); ensure(b, 'BatteryNotFound'); return b;
  }
  private matching(bid: string, rid: string, b: Battery): ReturnRequest {
    hash32(rid); this.available(`r:${rid}`); const r = this.requests.get(rid); ensure(r, 'RequestNotFound');
    ensure(r.batteryId === bid && b.requestId === rid, 'RequestMismatch'); return r;
  }
  private evidence(bid: string, rid: string, ev: Evidence, kind: Evidence['kind']) {
    ensure(ev.batteryId === bid, 'EvidenceBatteryMismatch'); ensure(ev.requestId === rid, 'EvidenceRequestMismatch');
    ensure(ev.kind === kind && ev.version === 1, 'InvalidEvidence'); nonzeroHash(ev.payloadHash);
    return evidenceCommitment(this.config, ev);
  }
  private apply(c: Command): unknown {
    if (c.kind === 'set_role') {
      StellarAddress.fromString(c.actor); ensure(c.role === 'COLLECTOR' || c.role === 'RECYCLER', 'InvalidInput');
      const key = `${c.actor}:${c.role}`, previous = this.roles.has(key);
      if (c.enabled) this.roles.add(key); else this.roles.delete(key); return previous !== c.enabled;
    }
    if (c.kind === 'register_battery') {
      batteryId(c.batteryId); this.available(`b:${c.batteryId}`); ensure(!this.batteries.has(c.batteryId), 'BatteryAlreadyExists'); nonzeroHash(c.registrationHash);
      const b: Battery = { state: 'REGISTERED', registrationHash: c.registrationHash, requestId: null, collector: null, collectionHash: null, recycler: null, recyclingHash: null, rewardState: 'NOT_ELIGIBLE' };
      this.batteries.set(c.batteryId, b); return structuredClone(b);
    }
    const b = this.battery(c.batteryId);
    switch (c.kind) {
      case 'open_return': {
        hash32(c.requestId); this.available(`r:${c.requestId}`); ensure(!this.requests.has(c.requestId), 'RequestIdAlreadyUsed');
        ensure(b.state === 'REGISTERED' && b.requestId === null && b.rewardState === 'NOT_ELIGIBLE', 'InvalidState');
        StellarAddress.fromString(c.recipient); ensure(c.recipient !== this.config.contractAddress, 'InvalidRecipient');
        this.requests.set(c.requestId, { batteryId: c.batteryId, recipient: c.recipient, state: 'OPEN' });
        b.state = 'RETURNED'; b.requestId = c.requestId; return c.requestId;
      }
      case 'cancel_return': {
        const r = this.matching(c.batteryId, c.requestId, b); ensure(r.state === 'OPEN', 'RequestNotOpen'); ensure(b.state === 'RETURNED', 'InvalidState');
        r.state = 'CANCELLED'; b.state = 'REGISTERED'; b.requestId = null; return b.state;
      }
      case 'confirm_collection': {
        ensure(this.roles.has(`${c.collector}:COLLECTOR`), 'RoleNotGranted');
        const r = this.matching(c.batteryId, c.requestId, b); ensure(r.state === 'OPEN', 'RequestNotOpen'); ensure(b.state === 'RETURNED', 'InvalidState');
        const hash = this.evidence(c.batteryId, c.requestId, c.evidence, 'COLLECTION');
        r.state = 'CONFIRMED'; b.state = 'COLLECTED'; b.collector = c.collector; b.collectionHash = hash; return b.state;
      }
      case 'confirm_recycling': {
        ensure(this.roles.has(`${c.recycler}:RECYCLER`), 'RoleNotGranted'); const r = this.matching(c.batteryId, c.requestId, b);
        ensure(b.state === 'COLLECTED' && r.state === 'CONFIRMED' && b.rewardState === 'NOT_ELIGIBLE', 'InvalidState');
        const hash = this.evidence(c.batteryId, c.requestId, c.evidence, 'RECYCLING');
        b.state = 'RECYCLED'; b.recycler = c.recycler; b.recyclingHash = hash; b.rewardState = 'PENDING';
        return { batteryState: b.state, rewardState: b.rewardState };
      }
      case 'pay_reward': {
        ensure(b.rewardState !== 'SENT', 'RewardAlreadySent'); ensure(b.state === 'RECYCLED' && b.rewardState === 'PENDING', 'RewardNotEligible');
        ensure(b.requestId, 'RequestMismatch'); const r = this.matching(c.batteryId, b.requestId, b); ensure(r.state === 'CONFIRMED', 'RequestMismatch');
        ensure(this.balance >= this.config.rewardAmount, 'InsufficientRewardBalance');
        b.rewardState = 'SENT'; ensure(!this.rejectTransfer, 'TokenTransferFailed');
        const amount = this.config.rewardAmount; ensure((this.balances.get(r.recipient) ?? 0n) + amount <= (1n << 127n) - 1n, 'TokenTransferFailed');
        this.balance -= amount; this.balances.set(r.recipient, (this.balances.get(r.recipient) ?? 0n) + amount);
        return { recipient: r.recipient, token: this.config.rewardToken, amount, rewardState: 'SENT' };
      }
    }
  }
}
