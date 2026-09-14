# Byetery: API HTTP sobre Supabase DEV

La API escucha solo en `127.0.0.1`. PostgreSQL y Auth pertenecen al proyecto
**Byetery Dev**, `aemxuqnnwfclzrwwiqfd`. Toda operación Stellar usa
`StellarService → MockStellarService`; no existe adaptador RPC ni conexión Testnet.
`SENT` es estado de recompensa: la batería permanece físicamente `RECYCLED`.

## Ejecutar desde la raíz

```powershell
npm --prefix backend ci
node scripts/check-dev-connection.mjs
npm run dev:setup
npm run api
```

`dev:setup` crea el deployment MOCK de `.env` si no existe y lo prefinancia con
1.000 recompensas simuladas de 10 GREEN-TEST. Repetirlo conserva el saldo y el
estado existentes. Las direcciones administrativas son simuladas; no se guardan
claves privadas. No se configura un activo ni una cuenta de red.

Crear usuarios de desarrollo mediante Supabase Auth (Dashboard o API Auth). Para
conceder un rol, ejecutar explícitamente desde la consola del servidor:

```powershell
npm run dev:setup -- --auth-user-id UUID_DEL_USUARIO_AUTH --role ADMIN
npm run dev:setup -- --auth-user-id UUID_DEL_USUARIO_AUTH --role COLLECTOR
npm run dev:setup -- --auth-user-id UUID_DEL_USUARIO_AUTH --role RECYCLER
```

El comando vincula roles de aplicación y, para actores operativos, concede el rol
Stellar mediante el mock. Son verificaciones distintas. Un usuario autenticado
sin privilegios recibe únicamente USER. Ningún endpoint HTTP concede roles.
La autenticación de contraseña se realiza directamente contra Supabase Auth;
no se añade un proxy de contraseñas ni un endpoint que emita tokens propios.

La demo y los tests provisionan sus propios usuarios efímeros, deployments e IDs:

```powershell
npm run demo:api
npm run test:http:dev
```

`demo:api` arranca una API real en un puerto loopback libre, realiza las llamadas
HTTP autenticadas y la cierra al terminar. No llama al coordinador para saltarse
las rutas de negocio. El provisioning y cleanup son tareas internas del harness.
La demo original `npm run demo` sigue siendo completamente local, sin red.

## Variables de entorno

Valores reales únicamente en el `.env` ignorado o en el entorno del proceso:

| Nombre | Finalidad |
| --- | --- |
| BYETERY_ENV | Debe ser DEV |
| BYETERY_MODE | Debe ser MOCK |
| BYETERY_DEPLOYMENT_ID | Deployment persistente para `api` y `dev:setup` |
| SUPABASE_PROJECT_REF | Proyecto DEV permitido |
| SUPABASE_URL | URL Auth del mismo proyecto |
| SUPABASE_PUBLISHABLE_KEY | Clave pública para validar sesiones |
| SUPABASE_SERVICE_ROLE_KEY | Administración Auth de fixtures; solo servidor |
| DATABASE_URL | Conexión PostgreSQL de servidor al proyecto DEV |
| DATABASE_SSL_CA | Ruta local del certificado público oficial |
| BYETERY_PORT | Puerto del servidor; 3001 por defecto, variable de proceso |

El cliente PostgreSQL verifica certificado y hostname con la CA oficial. No se
interpreta `sslmode` del URL para desactivar esa comprobación. El TLS externo al
pooler está verificado; `pg_stat_ssl` describe su conexión interna hacia PostgreSQL.
Ver [configuración de la CA y validación inicial](SUPABASE-DEV.md).
Las variables Stellar históricas de `.env.example` no se utilizan en esta fase.

## Capas y persistencia

```text
http.ts: rutas, límites, formato uniforme de errores
    → auth.ts + validation.ts
    → coordinator.ts / wallet.ts
    → repository.ts / PostgreSQL privado
    → StellarService / MockStellarService
```

La migración `20260913140711_application_http.sql` conserva Foundation y agrega
`api_private`: `memberships`, `wallet_challenges`, `idempotency`,
`operation_transport` y `mock_runtime`. Todas incluyen `deployment_id`, claves
foráneas, RLS habilitado y forzado, política restrictiva base-deny y revocación de
permisos para navegador. Se añade una clave única `(deployment_id,id)` a
`stellar_operations` para referencias compuestas. No hay funciones SECURITY DEFINER
ni cambios manuales de esquema fuera de migraciones.

El coordinador serializa transacciones por deployment mediante un advisory lock
transaccional PostgreSQL. Una operación se guarda en QUEUED, prepara y autoriza
los argumentos, pasa por AWAITING_AUTH/READY y guarda SUBMITTED junto con la
preparación, referencia y snapshot completo del mock. Otra transacción consulta
la confirmación. PENDING/UNKNOWN conserva UNKNOWN y no modifica la proyección.
Solo SUCCESS permite actualizar batería, solicitud, operación e intento.
FAILED confirmado rechaza la operación; nunca se deduce de un timeout.

El snapshot opaco contiene Maps, autorizaciones **simuladas**, submissions,
resultados y saldos del mock existente. Se valida su versión y deployment al
restaurarlo. Nunca se acepta un snapshot desde HTTP. No es una segunda máquina
de estados. El snapshot y la proyección se confirman atómicamente en PostgreSQL,
aprovechando que el mock no tiene efectos externos. Esta atomicidad no describe
una futura red Stellar. El servidor reconcilia al arrancar y cada dos segundos.

El formato binario usa serialización V8 y requiere compatibilidad con Node 24;
una futura actualización del formato necesitará conversión explícita. No se
interpreta un snapshot corrupto como deployment vacío. El crecimiento del
snapshot y la contención por deployment son límites deliberados del MVP.

## Autenticación, permisos e idempotencia

Cada llamada requiere `Authorization: Bearer <sesión Supabase>`. Auth valida el
token; después el repositorio comprueba que `auth.sessions` siga existiendo y no
esté vencida. La identidad de negocio se deriva de esa sesión y debe estar ACTIVE.
`user_metadata`, `role`, `admin=true` y `user_id` del cliente no otorgan permisos.
Los cuerpos admiten solo los campos documentados y rechazan campos adicionales.

Toda mutación exige `Idempotency-Key`, de 8 a 128 caracteres ASCII alfanuméricos,
punto, guion, dos puntos o guion bajo. Su ámbito es usuario + deployment y cubre
ruta y cuerpo canónico. Misma clave y entrada devuelven el resultado lógico
guardado; si está pendiente, consultan la misma operación. Otra entrada produce
409. No se crean otra solicitud, otro nonce o un segundo intento de recompensa.
Los errores de negocio también se conservan; corregir la entrada requiere clave nueva.

El contrato confía en `Config.service` para las acciones que provienen de usuarios
Supabase. No conoce su identidad personal. El servicio de Byetery valida sesión,
propiedad y wallet antes de autorizar. Collection obtiene las pruebas simuladas
del collector y de Config.service sobre una única preparación inmutable.

## Endpoints y cuerpos JSON

| Método y ruta | Permiso | Cuerpo |
| --- | --- | --- |
| POST /api/batteries | ADMIN | `{"batteryId":"BYE-000001","metadata":{}}` |
| GET /api/batteries/:batteryId | Sesión válida | Sin cuerpo |
| POST /api/batteries/:batteryId/returns | Sesión + wallet verificada | `{}` o `{"walletLinkId":"uuid"}` propio |
| POST /api/returns/:requestId/cancel | Propietario de la solicitud | `{}` |
| POST /api/returns/:requestId/collection | COLLECTOR + rol Stellar + service | Evidencia de COLLECTION |
| POST /api/returns/:requestId/recycling | RECYCLER + rol Stellar | Evidencia de RECYCLING |
| POST /api/batteries/:batteryId/reward | Propietario o ADMIN | `{}` |
| POST /api/wallet/challenge | Sesión válida | `{"address":"G..."}` |
| POST /api/wallet/verify | Propietario del challenge | `{"challengeId":"uuid","signature":"base64"}` |

Las respuestas relevantes incluyen `source: "MOCK"`. Registro y devolución
confirmados devuelven 201; otras confirmaciones, 200; incertidumbre, 202.
El GET devuelve exclusivamente `batteryId`, `confirmedBatteryState`,
`confirmedRewardState`, `pendingOperation`, `lastAttempt` y `source`.
Una fila en `battery_records` sin confirmación tiene estados confirmados nulos.
No se exponen destinatarios, usuarios internos, manifiestos ni credenciales.

El registro genera un manifiesto canónico de ID y metadatos y guarda sus bytes y
SHA-256. Los metadatos son un objeto JSON de hasta 8 KiB. Para collection/recycling:

```json
{
  "evidence": {
    "batteryId": "BYE-000001",
    "requestId": "64-caracteres-hex",
    "kind": "COLLECTION",
    "manifestBase64": "bytes-del-manifiesto-en-base64"
  }
}
```

El manifiesto decodificado es un objeto JSON que contiene los mismos `batteryId`,
`requestId` y `kind`. Sus bytes exactos, de hasta 16 KiB, se guardan sin volver a
serializarlos. El servidor asigna revisiones y rutas lógicas únicas, calcula el
payload_hash y reutiliza el compromiso XDR compatible con el vector Rust/WASM.
Las revisiones finalizadas son inmutables. No se suben fotos ni se habilita Storage.

El challenge dura diez minutos y contiene nonce CSPRNG, usuario, dirección G,
network Testnet, deployment, propósito y mensaje exacto. Se firma **el mensaje
decodificado de `messageBase64`** con Ed25519; el servidor usa el SDK Stellar para
verificar la firma. El consumo y creación del vínculo son atómicos. Hay cinco
intentos de firma como máximo; un nonce consumido o vencido no puede reutilizarse.
`WalletVerifier` permanece como interfaz sustituible; no hay proveedor alwaysTrue.
Las claves efímeras de los tests y la demo existen solo en memoria.

Una devolución genera `request_id` CSPRNG de 32 bytes y toma la dirección de un
vínculo verificado del usuario. La dirección y el usuario quedan inmutables; la
asociación se confirma junto con collection. El cliente no puede enviar recipient,
token ni amount. La cancelación solo permite RETURNED → REGISTERED antes de
collection. Recycling deja RECYCLED + PENDING; el pago confirmado deja SENT.

## Errores y límites HTTP

```json
{"error":{"code":"RequestOwnerRequired","message":"Request rejected: RequestOwnerRequired","requestId":"uuid-de-correlacion"}}
```

400: validación; 401: sesión ausente/revocada; 403: permiso; 404: recurso ausente;
409: idempotencia/transición; 422: evidencia/firma incompatible; 429: límite;
500: fallo interno sanitizado; 503: dependencia/configuración no disponible.
No se devuelven stack traces, SQL ni mensajes internos del driver.
El `requestId` del error es correlación HTTP, diferente del claim de 32 bytes.

Solo loopback, sin CORS ni cookies, solicitudes JSON hasta 32 KiB y 600 peticiones
por minuto por proceso. Las peticiones directas con Origin se rechazan. El frontend autorizado usa un proxy
Next del mismo origen que valida Origin y reenvía únicamente el bearer de sesión. Las respuestas son JSON, no-store y nosniff. Es una API
de desarrollo; no está configurada para exposición pública.

## Cleanup y límites pendientes

Los tests y la demo cierran sesiones, eliminan únicamente sus usuarios Auth y
desactivan sus identidades/roles/vínculos. Conservan deployments, baterías, claims,
evidencias e historial de operaciones: Foundation prohíbe borrarlos para impedir
reutilización y doble pago. No se deshabilitan triggers ni se resetea la base.
Las 82 pruebas SQL usan rollback y no dejan fixtures. Los datos de las suites
HTTP están aislados por deployment e IDs únicos, incluso entre ejecuciones simultáneas.

El acceso SQL de servidor utiliza la credencial DEV configurada, actualmente
privilegiada. El aislamiento del navegador se valida, pero el rol SQL de mínimo
privilegio y la auditoría histórica completa quedan para una fase posterior.
Supabase Advisors no indicó errores de RLS/esquema; informó que la protección Auth
contra contraseñas filtradas está desactivada. No se modificó esa configuración.
Ver [protección de contraseñas de Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
El frontend MVP está disponible en frontend/. No hay wallet gráfica, Storage público, Testnet ni despliegue Vercel.

## Lecturas para el frontend MVP

`GET /api/me`: sesión validada, sin parámetros de usuario. Devuelve `userId`, `roles`
de memberships activas, wallets propias verificadas/no revocadas y las últimas 100
solicitudes propias (`hasMoreRequests` indica truncamiento). Cada solicitud separa
estado del claim, estado físico, recompensa y operación pendiente. Una solicitud
antigua no hereda la recompensa de un claim posterior. Todos los joins incluyen deployment.

`GET /api/batteries/:batteryId` conserva su proyección y agrega `metadata` limitada
a cadenas `type`, `manufacturer`, `batch`, y `ownRequest` del usuario autenticado
o null. Nunca revela el claim, wallet o identidad de otro usuario. No hay gestión
de roles por HTTP ni nuevas mutaciones de negocio. Sin cambios de migración o RLS.
