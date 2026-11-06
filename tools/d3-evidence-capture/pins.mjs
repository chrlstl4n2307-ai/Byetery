import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPEC,ROOT,check,json,read,hash} from './common.mjs';
export function assertBusinessFingerprint(){const files=json(fileURLToPath(new URL('./business-files.json',import.meta.url))),names=Object.keys(files).sort();check(names.length===24,'WRONG_BUSINESS_PIN');let rows='';for(const name of names){check(/^(?:backend\/src|backend\/tests)\/[A-Za-z0-9_./-]+\.ts$/.test(name)&&!name.includes('..'),'WRONG_BUSINESS_PIN');check(hash(read(resolve(ROOT,name)))===files[name],'BLOCKED_FROZEN_SHA_DRIFT');rows+=name+'\t'+files[name]+'\n';}check(hash(Buffer.from(rows))===SPEC.fingerprint,'WRONG_BUSINESS_PIN');return {businessExecutionSha:SPEC.businessSha,fingerprint:SPEC.fingerprint,sourceTestFiles:24};}
