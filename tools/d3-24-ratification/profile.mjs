export const D324_IDENTITY = Object.freeze({
  taskId: 'D3-24-RUN1', runId: 'RUN1',
  businessSha: 'c50e4eb1f7f538a231c5ecfc31d19283998dc234',
  planHash: '3c03cfe14ea2bb091fba229c378ebea859b8ebdadbdbb6ee739b23b1b831a02d',
  batteryId: 'BYE-D3-R1-20261111-DCDE088CA870',
  recipient: 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
});
export const D324_OWNER_EXPORT = Object.freeze({
  schema: 'BYETERY_D324_OWNER_EXPORT_V1', businessSha: D324_IDENTITY.businessSha,
  querySha256: '5fb3da34f7ab1df05f9c5c167072e6a7e7c7e27ae3e5c5c699f88809538bfcee',
  queryUrl: new URL('./owner-export.sql', import.meta.url).href,
  scopeMetadata: Object.freeze({ task_id: D324_IDENTITY.taskId, plan_hash: D324_IDENTITY.planHash, battery_id: D324_IDENTITY.batteryId }),
});
