export const D324_IDENTITY = Object.freeze({
  taskId: 'D3-24-RUN1', runId: 'RUN1',
  businessSha: 'd85e54e00e98c8d8bc6294c883708a701ce55440',
  planHash: '0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d',
  batteryId: 'BYE-D3-R1-20261111-DCDE088CA870',
  recipient: 'GDXAWG56PVUHWGB5VSJRN6OUZTEL7M3SLKL46CDKKXQ42CU2XCS3PXCS',
});
export const D324_OWNER_EXPORT = Object.freeze({
  schema: 'BYETERY_D324_OWNER_EXPORT_V1', businessSha: D324_IDENTITY.businessSha,
  querySha256: '2a3a84852f3702bae428e646113a006f11205374caa8651086130ed2aec84ddd',
  queryUrl: new URL('./owner-export.sql', import.meta.url).href,
  scopeMetadata: Object.freeze({ task_id: D324_IDENTITY.taskId, plan_hash: D324_IDENTITY.planHash, battery_id: D324_IDENTITY.batteryId }),
});
