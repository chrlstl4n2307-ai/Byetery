import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { MockStellarService } from './mock-stellar-service.ts';
import { newRequestId, type Command, type Deployment, type Evidence } from './domain.ts';

const address = (n: number) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const contract = (n: number) => StrKey.encodeContract(Buffer.alloc(32, n));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const deployment: Deployment = {
  deploymentId: '11111111-1111-4111-8111-111111111111', mode: 'MOCK', schemaVersion: 1,
  networkId: hash('Test SDF Network ; September 2015'), contractAddress: contract(1),
  admin: address(1), service: address(2), rewardToken: contract(2), rewardAmount: 100_000_000n,
};
const service = new MockStellarService(deployment);
const batteryId = 'BYE-000001', requestId = newRequestId();
const collector = address(3), recycler = address(4), recipient = address(5);
const evidence = (kind: Evidence['kind']): Evidence => ({ version: 1, batteryId, requestId, kind, payloadHash: hash(`fictional-${kind}`) });
async function execute(command: Command) {
  const prepared = await service.prepare(deployment.deploymentId, command);
  const submission = await service.submit(prepared, prepared.requiredSigners.map(a => service.authorize(prepared, a)));
  const result = service.settle(submission);
  if (result.status !== 'SUCCESS') throw new Error(`Demo failed: ${JSON.stringify(result)}`);
}
async function show() {
  const battery = await service.getBattery(deployment.deploymentId, batteryId);
  console.log(`Physical: ${battery!.state} | Reward: ${battery!.rewardState}`);
}
console.log('BYETERY — LOCAL MOCK DEMO (no network, no real keys or tokens)');
console.log(`Battery ID: ${batteryId}\nRequest ID: ${requestId}\nSimulated wallet: ${recipient}`);
await execute({ kind: 'set_role', actor: collector, role: 'COLLECTOR', enabled: true });
await execute({ kind: 'set_role', actor: recycler, role: 'RECYCLER', enabled: true });
await execute({ kind: 'register_battery', batteryId, registrationHash: hash('fictional-registration') }); await show();
await execute({ kind: 'open_return', batteryId, requestId, recipient }); await show();
await execute({ kind: 'confirm_collection', batteryId, requestId, collector, evidence: evidence('COLLECTION') }); await show();
await execute({ kind: 'confirm_recycling', batteryId, requestId, recycler, evidence: evidence('RECYCLING') }); await show();
service.fund(deployment.rewardAmount);
await execute({ kind: 'pay_reward', batteryId }); await show();
if (service.recipientBalance(recipient) !== deployment.rewardAmount) throw new Error('Reward balance mismatch');
console.log('REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT');
console.log(`Reward: SENT | ${service.recipientBalance(recipient)} base units (10 GREEN-TEST, simulated 7 decimals)`);
