import {readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {check} from '../d3-evidence-capture/common.mjs';
import {auditLoadedXdrTree} from '../d3-evidence-capture/audit-imports.mjs';
export function offlineImportAudit(directory){const files=readdirSync(directory).filter(f=>f.endsWith('.mjs')&&!f.endsWith('.test.mjs')&&f!=='audit.mjs');
 for(const name of files){const s=readFileSync(resolve(directory,name),'utf8');check(!/(?:from|require\s*\(|import\s*\()\s*['"][^'"]*(?:backend\/src|local-secure-store|signer|worker|repository|@stellar\/stellar-sdk['"]|(?:node:)?(?:http|https|net|tls)['"]|['"]pg['"])/i.test(s),'OFFLINE_IMPORT_BOUNDARY_VIOLATION');check(!/\bfetch\s*\(|\.\s*(?:sign|signEnvelope|authorize|sendTransaction|simulateTransaction)\s*\(/.test(s),'OFFLINE_NETWORK_OR_SIGNING_PATH');if(name!=='identity.mjs')check(!s.includes('node:child_process'),'OFFLINE_PROCESS_BOUNDARY_VIOLATION');}
 return {status:'PASS',files,networkClients:0,signerImports:0,secretStoreImports:0,transitive:auditLoadedXdrTree()};
}
