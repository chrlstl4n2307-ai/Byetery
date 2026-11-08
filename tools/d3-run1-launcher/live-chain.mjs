import { createRequire } from 'node:module';
import { SPEC } from '../d3-evidence-capture/common.mjs';
import { PublicReads } from '../d3-evidence-capture/network.mjs';
import { X, ledgerEntry, native, rewardPoolKey } from '../d3-evidence-capture/xdr-reader.mjs';
import { RUN1, requireThat } from './boundaries.mjs';

const { Address, Asset, StrKey } = createRequire(new URL('../../backend/package.json', import.meta.url))('@stellar/stellar-sdk');
const horizon = 'https://horizon-testnet.stellar.org';
const sym = X.ScVal.scvSymbol;
const vec = X.ScVal.scvVec;
const dataKey = (contract, key) => X.LedgerKey.contractData(new X.LedgerKeyContractData({
  contract: new Address(contract).toScAddress(), durability: X.ContractDataDurability.persistent, key,
})).toXDR('base64');
const contractKey = key => dataKey(SPEC.contract, key);
const instance = X.ScVal.scvLedgerKeyContractInstance();
const roles = Object.entries(SPEC.actors);
const accountKey = address => X.LedgerKey.account(new X.LedgerKeyAccount({
  accountId: X.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(address)),
})).toXDR('base64');
const accounts = [...Object.values(SPEC.actors), ...SPEC.wallets];
const accountKeys = accounts.map(accountKey);
const keys = Object.freeze({
  battery: contractKey(vec([sym('Battery'), X.ScVal.scvString(RUN1.batteryId)])),
  code: X.LedgerKey.contractCode(new X.LedgerKeyContractCode({ hash: Buffer.from(SPEC.wasm, 'hex') })).toXDR('base64'),
  contract: contractKey(instance),
  sac: dataKey(SPEC.token, instance),
  pool: rewardPoolKey().toXDR('base64'),
  collector: contractKey(vec([sym('Role'), new Address(SPEC.actors.collector).toScVal(), vec([sym('Collector')])])),
  recycler: contractKey(vec([sym('Role'), new Address(SPEC.actors.recycler).toScVal(), vec([sym('Recycler')])])),
});
const check = (condition, code = 'CHAIN_READINESS_REJECTED') => requireThat(condition, code);
const units = value => {
  check(typeof value === 'string' && /^[0-9]+\.[0-9]{7}$/.test(value));
  return BigInt(value.replace('.', ''));
};

async function horizonAccount(address, fetcher) {
  const response = await fetcher(horizon + '/accounts/' + address, {
    method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(12_000),
  });
  check(response.ok && response.body, 'HORIZON_ACCOUNT_UNAVAILABLE');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    check(size <= 262_144, 'HORIZON_ACCOUNT_RESPONSE_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readChain(fetcher = fetch, now = Date.now) {
  const rpc = new PublicReads(fetcher);
  const [network, latest, entries, ...accountFacts] = await Promise.all([
    rpc.rpc('getNetwork'), rpc.rpc('getLatestLedger'),
    rpc.rpc('getLedgerEntries', { keys: [...Object.values(keys), ...accountKeys] }),
    ...accounts.map(address => horizonAccount(address, fetcher)),
  ]);
  const observedAt = now();
  const ledger = entries.value.latestLedger;
  const closeTime = Number(latest.value.closeTime);
  check(network.value.passphrase === SPEC.network &&
    new Asset(SPEC.asset, SPEC.issuer).contractId(SPEC.network) === SPEC.token, 'TESTNET_IDENTITY_REJECTED');
  check(Number.isSafeInteger(ledger) && ledger > 0 && Number.isSafeInteger(latest.value.sequence) &&
    Math.abs(ledger - latest.value.sequence) <= 5 && Number.isSafeInteger(closeTime) &&
    observedAt - closeTime * 1000 < 90_000 && observedAt - closeTime * 1000 >= -10_000);
  const rows = new Map((entries.value.entries ?? []).map(row => [row.key, row]));
  const requestedKeys = new Set([...Object.values(keys), ...accountKeys]);
  check(rows.size === entries.value.entries?.length && [...rows.keys()].every(key => requestedKeys.has(key)));
  const baseReserve = (await rpc.horizon('/ledgers/' + ledger)).value;
  check(baseReserve.sequence === ledger && Number.isSafeInteger(baseReserve.base_reserve_in_stroops) &&
    baseReserve.base_reserve_in_stroops > 0);
  const read = key => ledgerEntry(key, rows.get(key), ledger, new Date(observedAt).toISOString());
  const code = read(keys.code), contract = read(keys.contract), sac = read(keys.sac), pool = read(keys.pool);
  const collector = read(keys.collector), recycler = read(keys.recycler), battery = read(keys.battery);
  const active = [code, contract, sac, pool, collector, recycler];
  check(active.every(entry => entry.status === 'PRESENT' && Number.isSafeInteger(entry.liveUntilLedgerSeq) &&
    entry.liveUntilLedgerSeq > ledger), 'TESTNET_CONTRACT_STATE_UNAVAILABLE');
  check(!(entries.value.archivedEntries ?? []).some(row => row.key === keys.battery), 'ARCHIVED_BATTERY_COLLISION');
  const value = entry => X.LedgerEntryData.fromXDR(entry.entryXdr, 'base64').contractData.val;
  const deployed = value(contract).instance;
  const config = native(deployed.storage.find(row => native(row.key)?.[0] === 'Config').val);
  check(deployed.executable.type === 'contractExecutableWasm' &&
    Buffer.from(deployed.executable.wasmHash.toBytes()).toString('hex') === SPEC.wasm &&
    value(sac).instance.executable.type === 'contractExecutableStellarAsset' &&
    config.admin === SPEC.actors.admin && config.service === SPEC.actors.service &&
    config.reward_token === SPEC.token && config.reward_amount === '100000000' &&
    native(value(collector)) === true && native(value(recycler)) === true, 'TESTNET_CONTRACT_IDENTITY_REJECTED');

  const facts = accounts.map((address, index) => {
    const account = accountFacts[index];
    const row = rows.get(accountKeys[index]);
    check(row && account.account_id === address, 'TESTNET_ACCOUNT_UNAVAILABLE');
    const entry = X.LedgerEntryData.fromXDR(row.xdr, 'base64').account;
    const balance = account.balances.find(line => line.asset_type === 'native');
    check(StrKey.encodeEd25519PublicKey(entry.accountId.ed25519.toBytes()) === address &&
      entry.seqNum.toString() === account.sequence && BigInt(entry.balance.toString()) === units(balance.balance));
    return { account, balance };
  });
  const sources = roles.map(([role, address], index) => {
    const { account, balance } = facts[index];
    const reserveCount = 2 + account.subentry_count + account.num_sponsoring - account.num_sponsored;
    check(Number.isSafeInteger(reserveCount) && reserveCount >= 0 &&
      Number.isSafeInteger(account.thresholds.med_threshold));
    const available = units(balance.balance) - units(balance.selling_liabilities) -
      BigInt(reserveCount) * BigInt(baseReserve.base_reserve_in_stroops);
    const weight = account.signers.find(signer => signer.key === address)?.weight;
    check(Number.isSafeInteger(weight) && weight > 0 && weight >= account.thresholds.med_threshold);
    return { role, address, sequence: account.sequence, available };
  });
  const wallets = SPEC.wallets.map((address, index) => {
    const lines = facts[roles.length + index].account.balances.filter(line =>
      line.asset_code === SPEC.asset && line.asset_issuer === SPEC.issuer);
    check(lines.length === 1 && lines[0].is_authorized === true, 'WALLET_TRUSTLINE_REJECTED');
    const line = lines[0];
    return { address, balance: units(line.balance),
      capacity: units(line.limit) - units(line.balance) - units(line.buying_liabilities) };
  });
  const minimumTtl = Math.min(...active.map(entry => entry.liveUntilLedgerSeq)) - ledger;
  check(pool.value.authorized === true, 'POOL_AUTHORIZATION_REJECTED');
  return { ledger, observedAt, minimumTtl, sources, wallets, pool: BigInt(pool.value.amount),
    battery: battery.status === 'PRESENT' ? native(value(battery)) : null };
}
