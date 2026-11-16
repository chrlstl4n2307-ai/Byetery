import { createHash, verify } from 'node:crypto';
import { canonical } from '../../backend/src/application/validation.ts';

const domain='BYETERY-D324-PRE-DISPATCH-CLOSE-V1';

// Local prototype. The verifier process must resolve expectedDecision from
// independently approved pins and fresh evidence. Neither the closer nor its
// connection can supply the expected binding or the pinned owner public key.
export async function attestH2Approval(db, ownerPublicKey, expectedDecision, decision, encodedSignature) {
  if (!decision || typeof decision!=='object' || canonical(decision)!==canonical(expectedDecision))
    throw Error('H2_DECISION_BINDING_REJECTED');
  if (typeof encodedSignature!=='string' || !/^[A-Za-z0-9_-]{86}$/.test(encodedSignature))
    throw Error('H2_OWNER_SIGNATURE_REJECTED');
  const signature=Buffer.from(encodedSignature,'base64url');
  const bytes=Buffer.from(domain+'\n'+canonical(decision)+'\n');
  if (signature.length!==64 || signature.toString('base64url')!==encodedSignature ||
      ownerPublicKey.asymmetricKeyType!=='ed25519' || !verify(null,bytes,ownerPublicKey,signature))
    throw Error('H2_OWNER_SIGNATURE_REJECTED');
  const receipt={...decision,schemaVersion:decision.schema,
    reviewDigest:createHash('sha256').update(bytes).digest('hex'),budgetReleased:false};
  await db.query(`insert into api_private.d324_h2_verified_approval(operation_id,deployment_id,receipt)
    values($1,$2,$3::jsonb)`,[decision.operationId,decision.deploymentId,JSON.stringify(receipt)]);
  return receipt;
}
