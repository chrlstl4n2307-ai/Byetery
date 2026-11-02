import {ACTORS,AMOUNT,CONTRACT,ISSUER,TOKEN,WASM, type PlanInput} from '../src/d3/model.ts';
export const walletA='GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS';
export const walletB='GCOEEZR6CA4TU2WK7ZNAS6AJGHQH7NGYWKO7HZ3HQIF7EJATGLBNKOUZ';
/** Public addresses are fixture inputs, not an owner selection or USER2 mapping. */
export function d3Input():PlanInput{return {version:1,gitSha:'b9a1efd51f75862623992ef22dcd38b946bbc63f',network:'TESTNET',contractId:CONTRACT,wasmSha256:WASM,assetCode:'GREENTEST',issuer:ISSUER,sac:TOKEN,rewardBaseUnits:AMOUNT,runs:[
 {runId:'RUN1',batteryId:'BYE-D3-OFFLINE-1',recipient:walletA,negativeCases:['duplicate_reward','altered_record']},
 {runId:'RUN2',batteryId:'BYE-D3-OFFLINE-2',recipient:walletB,negativeCases:['early_reward','invalid_transition','unauthorized_recycler']},
 {runId:'RUN3',batteryId:'BYE-D3-OFFLINE-3',recipient:walletA,negativeCases:['uncertain_response']},
]};}
export function executionContext(){return {ownerDecisionId:'OFFLINE-TEST-ONLY',reviewedGitSha:d3Input().gitSha,network:'TESTNET',contractId:CONTRACT,wasmSha256:WASM,assetCode:'GREENTEST',issuer:ISSUER,sac:TOKEN,rewardBaseUnits:AMOUNT,signerAvailable:true,uniqueBatteryIdsVerified:true,recipientTrustlinesReady:true,expectedInitialStates:true,rewardAlreadySent:false,unresolvedOperation:false,sourceSequenceStable:true};}
export {ACTORS};
