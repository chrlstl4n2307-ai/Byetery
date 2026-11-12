import { realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, read } from '../d3-evidence-capture/common.mjs';
import { checkedOutCommit, checkSharedGitDirectory } from '../d3-run1-launcher/f1-checkout.mjs';
import { requireThat as check } from '../d3-run1-launcher/boundaries.mjs';
import { verifyD324OperatorCommit } from '../d3-24-ratification/operator-identity.mjs';

export async function resolveD324Operator(compositionRoot, operatorRoot) {
  check(typeof operatorRoot === 'string' && isAbsolute(operatorRoot) && resolve(operatorRoot) === operatorRoot &&
    operatorRoot !== compositionRoot && await realpath(operatorRoot) === operatorRoot, 'D324_OPERATOR_CHECKOUT_REJECTED');
  const pin = verifyD324OperatorCommit();
  await checkSharedGitDirectory(compositionRoot, operatorRoot);
  check(await checkedOutCommit(operatorRoot, ['.']) === pin.sha, 'D324_OPERATOR_CHECKOUT_REJECTED');
  const path = join(operatorRoot, 'backend', 'src', 'd3', 'live-operator.ts');
  check(await realpath(path) === path && hash(read(path, 65_536)) === pin.sourceSha256, 'D324_OPERATOR_FILE_REJECTED');
  return Object.freeze({ path, root: operatorRoot, sha: pin.sha });
}

// Importing the frozen module performs no operation. The factory itself stays
// behind the owner approvals, the read-only preflight and exclusive admission.
export async function loadD324Operator(compositionRoot, operatorRoot) {
  const operator = await resolveD324Operator(compositionRoot, operatorRoot);
  const { createLocalOperator } = await import(pathToFileURL(operator.path).href);
  check(typeof createLocalOperator === 'function', 'D324_OPERATOR_FACTORY_REJECTED');
  return Object.freeze({ ...operator, createLocalOperator });
}
