# Arquitectura objetivo — Byetery

La propuesta aprobada se mantiene como objetivo. Backend Foundation implementa solo
el núcleo de almacenamiento y simulación, sin habilitar acceso externo.

## Responsabilidades

Supabase mantiene identidad, permisos de aplicación, wallets verificadas, evidencias
privadas, solicitudes y coordinación. Soroban mantiene estados físicos, solicitudes,
roles Stellar y recompensas. StellarService desacopla ambos componentes.

La copia chain_private contiene exclusivamente observaciones confirmadas, aisladas
por deployment_id. La aplicación conserva las intenciones y estados pendientes en
app_private. Las simulaciones pertenecen a deployments MOCK independientes; nunca
se promueven sus confirmaciones a Testnet.

## Modelo objetivo y entrega incremental

| Componente | Foundation | Fase posterior |
|---|---|---|
| deployments/users/wallet_links | Tablas y restricciones | Alta de usuarios y verificación real de pruebas |
| battery_records/return_requests | Identidad, wallet y reserva inmutables; IDs CSPRNG | Coordinadores autenticados y políticas de lectura |
| evidence_versions | Versiones finalizadas, bytes, hash y referencia privada | Desafíos de carga, archivos, validación de manifiesto y Storage |
| actor_roles | Roles confirmados | app_admins, actor_memberships y validación de membresías |
| chain batteries/requests | Proyección consistente | Importación de observaciones externas verificadas |
| stellar_operations | Idempotencia y estados pendientes | Workers, envelopes y stellar_transactions |
| reward_attempts | Intentos separados de recompensa, exclusión de duplicados | Reintentos coordinados y tratamiento de errores reales |
| StellarService | Interfaz y mock | Adaptador Testnet y firmantes |
| WalletVerifier | Interfaz sin proveedor | wallet_challenges persistentes y consumo de nonce |
| work_assignments | Diferido | Acceso de operadores limitado a solicitudes asignadas |
| events/sync_cursors | Diferido | Reconciliación histórica durable y deduplicación |
| Auditoría | Diferida | Bitácora completa de permisos, acciones y conciliación |

## Flujo objetivo

1. Usuario autenticado prueba control de wallet; desafío de un solo uso ligado a dominio,
   identidad, dirección, red, propósito y expiración. No se guardan claves privadas.
2. Servidor reserva request_id CSPRNG de 32 bytes, batería, usuario y destinatario.
   QR y claim identifican; no conceden autorización.
3. Se crea una operación durable e idempotente. El worker prepara la invocación, obtiene
   sus autorizaciones y persiste el envelope antes de enviarlo.
4. Solo un resultado exitoso verificado permite actualizar la proyección confirmada.
   Una respuesta incierta conserva UNKNOWN; nunca equivale a inexistencia o fracaso.
5. confirm_collection requiere actor Collector y Config.service sobre idénticos argumentos.
   Fija la asociación operativa, confirma la solicitud y conserva su destinatario original.
6. confirm_recycling requiere Recycler y convierte la recompensa en PENDING.
7. pay_reward requiere service y usa el token/importe configurados y el destinatario
   almacenado. Contrato prefinanciado, transferencia y SENT atómicos.

## Evidencias

Las revisiones documentales son independientes de Evidence.version=1. No se sobrescribe
una revisión comprometida. El manifiesto canónico identifica batería, solicitud, tipo y
hashes de archivos; se guardan sus bytes exactos. Registro usa registration_hash.
Recolección/reciclaje usan SHA256(XDR(ScVal(tuple("BYETERY_EVIDENCE_V1", network_id,
contract_address, Evidence)))). Fotos y datos personales permanecen off-chain.

El acceso futuro será por bucket privado y URL temporal, con validación de pertenencia.
Un archivo revisado no modifica el compromiso histórico confirmado.

## Permisos objetivo

Visitantes sin acceso a tablas privadas. Usuarios acceden a sus datos mediante servicios
autenticados; operadores solo a solicitudes autorizadas. Roles de aplicación y roles
Stellar se verifican separadamente. Ningún navegador escribe roles, estados, destinatarios
o recompensas. Foundation aplica base-deny total; las lecturas se abrirán deliberadamente
cuando exista la capa de aplicación.

No confiar en user_metadata editable. Las credenciales service_role y claves firmantes
quedan exclusivamente en servidor, separadas entre sí. RLS no sustituye las comprobaciones
del backend privilegiado ni verifica firmas de blockchain.

## Reconciliación futura

Separar operación lógica, intentos de transacción y eventos. Persistir hashes/envelopes antes
del envío. Procesar ledger y orden de transacción, deduplicar eventos y conservar cursor.
NOT_FOUND tiene significado incierto ante retención limitada. Datos archivados requieren
restauración; no liberar IDs ni crear nuevas recompensas por una consulta incompleta.
Las solicitudes externas se importan sin inventar user_id ni atribuir propiedad por wallet.

La vista de usuario conservará campos distintos para estado físico confirmado, recompensa
confirmada, operación pendiente, último intento y origen/posición de sincronización.

## Decisiones de Foundation

- Once tablas; sin work_assignments, eventos históricos ni subsistema de auditoría.
- Evidence_versions almacena solo revisiones finalizadas e inmutables.
- El flujo combinado mock/SQL vive en el harness de integración, no en endpoints.
- No se proporciona todavía un worker durable ni configuración de roles de runtime.
- Restricciones SQL diferidas exigen proyectar conjuntamente solicitud, batería y asociación.
- Las inserciones de proyección pueden representar snapshots ya avanzados para la futura
  importación; las actualizaciones respetan la máquina de estados y ledgers no decrecientes.
- La capa de proyección es de confianza: solo el futuro reconciliador podrá escribirla.
  PostgreSQL no puede certificar por sí mismo que una transacción Stellar ocurrió.
