import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('frozen contract source and Cargo dependencies remain byte-identical',async()=>{
 const hashes:Record<string,string>={
  'src/events.rs':'c823675a220ec86e75d8091ccca0a5505ad103f4747f3d3207b482b1dc7f030e',
  'src/lib.rs':'4be0f127ed23fcbb83e8d646cca0d37f1ce412e5f084b40016fa2981f1db6141',
  'src/test.rs':'ed1285ee520d9ffbeb775b5d27087c97ff92d7942fc365a980c2ec0bffaa127f',
  'src/types.rs':'df13bf53a19c0dcc8d9ead0f1c4cf985ae479474d4a5300386b48d82bc580bad',
  'Cargo.toml':'6a04c700c43d73990b1da8b9bb27d69a0153fef0f36a3d4f66b3395ae2da5f51',
  'Cargo.lock':'04f709c7cb5d1b043cb5d32d310f2640144563a8f056470e95fe84dc3ebeabb9',
 };
 for(const [file,expected] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(new URL(`../../contracts/byetery-contract/${file}`,import.meta.url))).digest('hex'),expected,file);
});
