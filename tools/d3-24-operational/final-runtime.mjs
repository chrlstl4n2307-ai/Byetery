import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { prepareD324Bridge } from './prelive-bridge.mjs';
import { isD324PrivateSessionClient } from './private-session-channel.mjs';

// V3 candidate binding. The historical entrypoints still reject activation.
// The published bridge owns orchestration and restricts its port to fixtures.
export async function prepareD324RuntimeV3Review({ channel, sessionOptions, localControl, port }) {
  check(isD324PrivateSessionClient(channel) && port.classification === 'OFFLINE_SYNTHETIC',
    'D324_OPERATIONAL_RATIFICATION_REQUIRED');
  const { onFixtureHeaders, ...options } = sessionOptions;
  const control = Object.freeze({ ...channel, async prepare(headers) {
    const receipt = await channel.prepare(headers);
    // The synthetic proof port needs the same bearers in process memory.
    onFixtureHeaders?.(headers, receipt);
    return receipt;
  } });
  return prepareD324Bridge({ sessionOptions: { ...options, control }, localControl, port });
}

// Keep historical direct imports fail-closed. Only the V3 review bridge is wired.
export async function executeD324ApprovedRun() {
  throw Error('D324_OPERATIONAL_RATIFICATION_REQUIRED');
}
