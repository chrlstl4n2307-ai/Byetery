// Test-only reuse of the existing isolated application/worker fixture. No second
// business state machine is implemented here, and no production module is patched.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { RUN1 } from '../../d3-24-ratification/identity.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const virtual = pathToFileURL(join(root, 'backend/tests/__composition_five_steps__.ts')).href;
let source = readFileSync(join(root, 'backend/tests/d324-authority.test.ts'), 'utf8');
const old = "const compositionSha='a'.repeat(40),operatorSha='b'.repeat(40),planHash='c'.repeat(64);";
if (!source.includes(old)) throw Error('SyntheticFixtureDrift');
source = source.replace(old, "const compositionSha='a'.repeat(40),operatorSha='" + RUN1.businessSha + "',planHash='" + RUN1.planHash + "';");
source = 'const skipFixtureTest=(...unused:unknown[])=>{};\n' + source.replace(/(?<![\w.])test\(/g, 'skipFixtureTest(');
source += '\nexport {verifyFiveSteps};';
registerHooks({ resolve(s,c,n) { if(s==='composition:five')return {url:virtual,shortCircuit:true};return n(s,c); },
  load(u,c,n) { if(u===virtual)return {format:'module-typescript',source,shortCircuit:true};return n(u,c); } });
const { verifyFiveSteps } = await import('composition:five');
await verifyFiveSteps();
for (const ordinal of [1,2,3,4,5]) await verifyFiveSteps(ordinal);
for (const ordinal of [2,5]) await verifyFiveSteps(undefined,ordinal);
console.log(JSON.stringify({FIVE_STEP_CANDIDATE:'PASS',cases:8,operatorSha:RUN1.businessSha,planHash:RUN1.planHash,
  source:'SYNTHETIC_APPLICATION_WORKER',simulatedMinutes:68,realTransactions:0,realAuthSessions:0,realAdmissions:0}));
