// Synthetic child only. It has no Secure Store, Auth, SQL or network adapter.
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createInterface} from 'node:readline';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const request=(await lines.next()).value;
const hash=createHash('sha256').update(request).digest('hex');
for(const stage of ['LOAD','SIGN']){
  console.log(JSON.stringify({version:3,status:'key_ready',stage,requestHash:hash}));
  const line=await lines.next();
  if(line.done)process.exit(1);
  const permit=JSON.parse(line.value);
  if(permit.status!=='key_permit'||permit.stage!==stage||permit.requestHash!==hash)process.exit(1);
}
const key=generateKeyPairSync('ed25519');
sign(null,Buffer.from('synthetic fixture only'),key.privateKey);
console.log(JSON.stringify({syntheticKeyUses:1}));
