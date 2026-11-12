export const D324 = Object.freeze({
  deploymentId:'5c0cad2f-5f25-4216-8068-6cb9d2d26325',
  batteryId:'BYE-D3-R1-20261111-DCDE088CA870',
  taskId:'D3-24-RUN1',runId:'RUN1',
  recipient:'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
  networkId:'cee0302d59844d32bdca915c8203dd44b33fbb7edc19051ea37abedf28ecd472',
  historicalConfirmed:5,ordinaryLimit:19,runCap:5,tx20Authorized:false,
});
const deploymentKey=D324.deploymentId.replaceAll('-','');
export function d324Scope(deploymentId:string,batteryId:string|null|undefined) {
  return batteryId===D324.batteryId&&deploymentId.toLowerCase().replace(/[{}-]/g,'')===deploymentKey;
}
