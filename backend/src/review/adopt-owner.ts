import type {AdoptionResult} from './registration-intents.ts';
import {requireThat} from '../application/errors.ts';
import {uuid} from '../application/validation.ts';

export interface OwnerAdoptionTool {adopt(operationId:string):Promise<AdoptionResult>}
/** Local command entry: exactly one UUID, no overrides, HTTP, processor or signer.
 * B1 tests inject OwnerRegistrationAdoption with a deterministic local precheck.
 * Live adapter/bootstrap is deliberately not installed by this foundation task.
 */
export async function adoptReviewRegistration(args:readonly string[],owner:OwnerAdoptionTool):Promise<AdoptionResult>{
 requireThat(args.length===1,400,'OneOperationIdRequired');
 return owner.adopt(uuid(args[0]));
}
