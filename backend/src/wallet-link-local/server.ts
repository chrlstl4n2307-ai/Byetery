import { assertLocalRuntime } from '../d3/operator-guard.ts';
// Guard precedes dynamic loading of configuration, database and Auth modules.
try {
  assertLocalRuntime();
  const {startWalletLocal}=await import('./runtime.ts');
  await startWalletLocal();
}catch{console.error('Local wallet linking unavailable. No operational server was started.');process.exitCode=1;}
