// @vitest-environment node
import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {auditBuild} from '../../scripts/instaward/b44-prep-build-audit.mjs';
it('PREP audited real LOCAL build has exact routes, zero actions and no client Stellar/server/secret leakage',async()=>{
 const root=process.env.B44_PREP_BUILD_ROOT;
 expect(root,'Run scripts/instaward/b44-prep-local.py').toBeTruthy();
 const r=await auditBuild(root!);expect(r.pass).toBe(true);expect(r.client.secretScan).toBe('NO MATCH');
 expect(r.client.findings).toEqual([]);expect(r.manifests.serverActions).toBe(0);expect(r.manifests.routePass).toBe(true);
});
it('PREP build copy has no .env files and uses exactly the original dependency lock',()=>{
 const root=process.env.B44_PREP_BUILD_ROOT!;
 expect(fs.readdirSync(root).filter(n=>n==='.env'||n.startsWith('.env.'))).toEqual([]);
 expect(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')).toBe(fs.readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
});
