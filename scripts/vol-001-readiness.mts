/** VOL-001. Read-only Testnet assessment; no signer and no broadcast transport. */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Address, Contract, Account, TransactionBuilder, nativeToScVal, scValToNative, xdr } = require('@stellar/stellar-sdk');
export const RPC = 'https://soroban-testnet.stellar.org';
export const NETWORK = 'Test SDF Network ; September 2015';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = new Set(['getNetwork', 'getLatestLedger', 'getVersionInfo', 'getLedgerEntries', 'simulateTransaction']);
export async function rpcRead(method: string, params: object = {}, transport: typeof fetch = fetch): Promise<any> {
  if (!ALLOWED.has(method)) throw new Error('ReadOnlyMethodRequired');
  const response = await transport(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json() as any;
  if (body.error) throw new Error(`RPC ${method} error ${body.error.code}`);
  return body.result;
}
const str = (s: string) => nativeToScVal(s, { type: 'string' });
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const vec = (...values: any[]) => xdr.ScVal.scvVec(values);
export function ledgerKey(contract: string, key: any, persistent = true): any {
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(),
    key, durability: persistent ? xdr.ContractDataDurability.persistent : xdr.ContractDataDurability.temporary }));
}
export function classify(entry: any, ledger: number): string {
  if (!entry) return 'NOT_RETURNED_UNKNOWN'; // Never equate omission to nonexistence.
  if (typeof entry.liveUntilLedgerSeq !== 'number') return 'PRESENT_TTL_UNAVAILABLE';
  return entry.liveUntilLedgerSeq >= ledger ? 'LIVE' : 'ARCHIVED';
}
export function restorationIndices(data: any): number[] | null {
  if (!data) return null;
  return data.ext.type === 'resourceExt' ? [...data.ext.resourceExt.archivedSorobanEntries] : [];
}
function codeHash(entry: any): string | null {
  if (!entry) return null;
  const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
  const executable = data.contractData.val.instance.executable;
  return executable.type === 'contractExecutableWasm' ? Buffer.from(executable.wasmHash.toBytes()).toString('hex') : null;
}
function safeNative(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) return value.map(safeNative);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeNative(v)]));
  return value;
}
function readValue(entry: any): any {
  if (!entry) return null;
  const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
  return data.type === 'contractData' ? safeNative(scValToNative(data.contractData.val)) : null;
}
export async function assess(): Promise<any> {
  const historic = JSON.parse(await readFile(path.join(ROOT, 'docs/testnet/validation-2026-09-26.json'), 'utf8'));
  const contract = historic.contractId, token = historic.tokenId;
  const [network, latest, version] = await Promise.all(['getNetwork', 'getLatestLedger', 'getVersionInfo'].map(m => rpcRead(m)));
  if (network.passphrase !== NETWORK) throw new Error('WrongNetwork');
  if (contract !== 'CDMGW6M3A56EHHEQPP5A3NGTWWETFP7LOMB3CU5S67374VT3BPVCNWON' ||
      token !== 'CB2RBZCH2DKLB2KFTKKEIDJBK53WKT2FQBQRTAN2JKJVEBAMCDEY6D7G') throw new Error('UnexpectedDeployment');
  const items: any[] = [
    { name: 'byetery_instance', key: new Contract(contract).getFootprint() },
    { name: 'collector_role', key: ledgerKey(contract, vec(sym('Role'), new Address(historic.actors.collector.address).toScVal(), vec(sym('Collector')))) },
    { name: 'recycler_role', key: ledgerKey(contract, vec(sym('Role'), new Address(historic.actors.recycler.address).toScVal(), vec(sym('Recycler')))) },
    { name: 'historical_battery', key: ledgerKey(contract, vec(sym('Battery'), str(historic.batteryId))) },
    { name: 'historical_request', key: ledgerKey(contract, vec(sym('Request'), xdr.ScVal.scvBytes(Buffer.from(historic.requestId, 'hex')))) },
    { name: 'reward_sac_instance', key: new Contract(token).getFootprint() },
    { name: 'reward_contract_balance', key: ledgerKey(token, vec(sym('Balance'), new Address(contract).toScVal())) },
  ];
  let entries = await rpcRead('getLedgerEntries', { keys: items.map(i => i.key.toXDR('base64')) });
  const lookup = new Map(entries.entries.map((e: any) => [e.key, e]));
  for (const i of items) i.entry = lookup.get(i.key.toXDR('base64'));
  const wasm = codeHash(items[0].entry);
  if (wasm) items.push({ name: 'byetery_code', key: xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(wasm, 'hex') })) });
  else items.push({ name: 'byetery_code', key: xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from('c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6', 'hex') })) });
  entries = await rpcRead('getLedgerEntries', { keys: items.map(i => i.key.toXDR('base64')) });
  const current = new Map(entries.entries.map((e: any) => [e.key, e]));
  const inventory = items.map(i => {
    const e: any = current.get(i.key.toXDR('base64'));
    const value = i.name.endsWith('_instance') || i.name.endsWith('_code') ? null : readValue(e);
    let deployedHash = null, deployedCodeSize = null;
    if (i.name === 'byetery_code' && e) {
      const data = xdr.LedgerEntryData.fromXDR(e.xdr, 'base64');
      if (data.type === 'contractCode') {
        const code = Buffer.from(data.contractCode.code);
        deployedHash = createHash('sha256').update(code).digest('hex');
        deployedCodeSize = code.length;
      }
    }
    return { name: i.name, keyXdr: i.key.toXDR('base64'), status: classify(e, entries.latestLedger),
      observedLedger: entries.latestLedger, liveUntilLedger: e?.liveUntilLedgerSeq ?? null,
      remainingLedgers: e?.liveUntilLedgerSeq === undefined ? null : e.liveUntilLedgerSeq - entries.latestLedger,
      lastModifiedLedger: e?.lastModifiedLedgerSeq ?? null, value, deployedCodeSha256: deployedHash, deployedCodeSize };
  });
  // Unsigned simulations only. Never prepare a signed envelope or call sendTransaction.
  const accountKey = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: new Address(historic.actors.service.address).toScAddress().accountId }));
  const accountReply = await rpcRead('getLedgerEntries', { keys: [accountKey.toXDR('base64')] });
  const accountEntry = accountReply.entries[0];
  if (!accountEntry) throw new Error('ServiceAccountNotReturned');
  const accountData = xdr.LedgerEntryData.fromXDR(accountEntry.xdr, 'base64');
  const sequence = accountData.account.seqNum.toString();
  const simulations: any[] = [];
  const calls = [
    { name: 'get_config', contract, args: [] },
    { name: 'get_battery', contract, args: [str(historic.batteryId)] },
    { name: 'get_request', contract, args: [xdr.ScVal.scvBytes(Buffer.from(historic.requestId, 'hex'))] },
    { name: 'has_role', contract, args: [new Address(historic.actors.collector.address).toScVal(), vec(sym('Collector'))] },
    { name: 'balance', contract: token, args: [new Address(contract).toScVal()] },
  ];
  for (const call of calls) {
    const tx = new TransactionBuilder(new Account(historic.actors.service.address, sequence), { fee: '10000', networkPassphrase: NETWORK })
      .addOperation(new Contract(call.contract).call(call.name, ...call.args)).setTimeout(120).build();
    const sim = await rpcRead('simulateTransaction', { transaction: tx.toXDR() });
    const data = sim.transactionData ? xdr.SorobanTransactionData.fromXDR(sim.transactionData, 'base64') : null;
    const restoreList = restorationIndices(data);
    const values = (sim.results ?? []).map((r: any) => safeNative(scValToNative(xdr.ScVal.fromXDR(r.xdr, 'base64'))));
    simulations.push({ method: call.name, contract: call.contract, ledger: sim.latestLedger,
      status: sim.error ? 'SIMULATION_ERROR' : 'SIMULATION_SUCCESS', error: sim.error ?? null,
      minResourceFee: sim.minResourceFee ?? null, restorePreambleFee: sim.restorePreamble?.minResourceFee ?? null,
      restoreList, restoredFootprintKeys: restoreList?.map(i => data.resources.footprint.readWrite[i]?.toXDR('base64') ?? null) ?? null,
      transactionDataSha256: sim.transactionData ? createHash('sha256').update(Buffer.from(sim.transactionData,'base64')).digest('hex') : null,
      transactionDataExtension: data?.ext.type ?? null, values, transactionSubmitted: false });
  }
  return { taskId: 'VOL-001', classification: 'VOLUNTARY PRE-SPRINT DEVELOPMENT', date: '2026-10-11', timezone: 'America/Santiago',
    capturedAtUtc: new Date().toISOString(), branch: 'pre-sprint/voluntary-d1', frozenCommit: '450c21b151a0973064986327f09d55e4f36c43e0',
    network: 'Stellar Testnet', rpc: RPC, protocolVersion: network.protocolVersion,
    latestLedger: latest.sequence, latestLedgerHash: latest.id, latestLedgerCloseTime: latest.closeTime,
    evaluatedSourceCommit: execFileSync('git',['--no-optional-locks','rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    assessmentScriptSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    rpcVersion: version.version, contract, token, inventory, simulations, signerFeeCapStroops: '50000000',
    transactionsSubmitted: 0, restoredEntries: 0, ttlExtensions: 0, signaturesCreated: 0,
    limits: ['Scoped known entries only; not an exhaustive contract-storage inventory.',
      'NOT_RETURNED_UNKNOWN is not proof of absence.', 'Simulated automatic restoration has no ledger effect.',
      'Fees and TTLs are point-in-time observations, not production guarantees.'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await assess();
  await mkdir(path.join(ROOT, 'docs/voluntary'), { recursive: true });
  await writeFile(path.join(ROOT, 'docs/voluntary/VOL-001-public-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ task: report.taskId, latestLedger: report.latestLedger,
    entries: report.inventory.map((e: any) => ({ name: e.name, status: e.status, liveUntilLedger: e.liveUntilLedger })),
    fees: report.simulations.map((s: any) => ({ method: s.method, fee: s.minResourceFee, restoreList: s.restoreList })), transactionsSubmitted: 0 }, null, 2));
}
