import {check,hash,SPEC} from './common.mjs';

export const TESTNET_PASSPHRASE='Test SDF Network ; September 2015';
export const networkIdFromPassphrase=passphrase=>{check(typeof passphrase==='string','WRONG_NETWORK');return hash(Buffer.from(passphrase,'utf8'));};
export function assertTestnetNetwork(passphrase,networkId){
 check(passphrase===TESTNET_PASSPHRASE&&SPEC.network===TESTNET_PASSPHRASE,'WRONG_NETWORK');
 const derived=networkIdFromPassphrase(TESTNET_PASSPHRASE);
 check(SPEC.networkId===derived&&(networkId===undefined||networkId===derived),'WRONG_NETWORK_ID');return derived;
}
