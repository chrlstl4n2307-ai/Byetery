import { open } from 'node:fs/promises';
import { evidenceV1Disclosure, verifyEvidenceV1 } from './evidence-verifier.ts';

// Offline only. No environment loading, database, network, signer or transaction imports.
let status: 'VERIFIED' | 'NOT_VERIFIED' | 'INVALID_INPUT' = 'INVALID_INPUT';
try {
  if (process.argv.length === 3) {
    const handle = await open(process.argv[2], 'r');
    try {
      // Bounded read even when the file changes after opening.
      const bytes = Buffer.alloc(65537);
      let size = 0;
      while (size < bytes.length) {
        const read = await handle.read(bytes, size, bytes.length - size, null);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size <= 65536) {
        const input = evidenceV1Disclosure(JSON.parse(bytes.subarray(0, size).toString('utf8')));
        if (input) status = verifyEvidenceV1(input).status;
      }
    } finally { await handle.close(); }
  }
} catch { /* Never print file contents, input values or provider diagnostics. */ }
console.log(status);
process.exitCode = status === 'VERIFIED' ? 0 : status === 'NOT_VERIFIED' ? 1 : 2;
