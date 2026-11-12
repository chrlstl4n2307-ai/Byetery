# D3-24-RUN1 — Candidato local de autorización en el servidor

Estado **HOLD**. La composición normal del servidor mantiene cerrada la admisión D3-24. La prueba positiva conecta el verificador con pines y llaves efímeras de fixture dentro del proceso. La migración es candidata para revisión.

## Reserva y carrera de instalación

La migración reserva `5c0cad2f-5f25-4216-8068-6cb9d2d26325 / BYE-D3-R1-20261111-DCDE088CA870` en una tabla privada. La clave primaria y los constraints fijan el alcance. El rol de migración administra la reserva. Las tablas de control tienen RLS forzada y se revocan permisos a `PUBLIC`, `anon` y `authenticated`.

El instalador toma el advisory lock de ese deployment y bloqueos de tabla antes de inspeccionar preexistencia. Si una inscripción anterior gana la carrera, la migración aborta completa y conserva la inscripción para revisión. Si la migración gana, el INSERT que esperaba se evalúa con el trigger nuevo y se rechaza sin una reserva de paso en esa transacción. La reserva y los triggers aparecen en un solo COMMIT. El coordinador reconoce la pareja fija incluso si falta la reserva. El servidor valida el formato UUID y lo normaliza. La frontera también resuelve las rutas por ID de devolución mediante SQL.

## Autorizaciones y prueba de posesión

Los pines se reciben del proceso servidor. La configuración HTTP y el cliente carecen de autoridad para instalar pines. El SHA-256 fijado del manifiesto determina sus bytes exactos y la firma Ed25519 del propietario se valida de forma separada.

| Objeto | Bytes firmados o alcance |
| --- | --- |
| Manifiesto V3 | `BYETERY-D324-MANIFEST-APPROVAL-V3\n<sha256>\n`. El digest fija composición, operador, plan, batería, destinatario, red y política presupuestaria. |
| Grant | Bytes canónicos `BYETERY-D3-RUN1-OWNER-GRANT-V1`, acción `AUTHORIZE_D3_24_RUN1_EXECUTION`, identidad exacta, SHA de composición, nonce de 32 bytes y 900000 ms de duración. Observación JWT menor a 600000 ms al admitir. |
| Ejecución V1 | `BYETERY-D324-EXECUTION-V1` y JSON canónico con LF final. Fija tarea, composición, operador, plan, batería, destinatario, red, instancia, desafío, runner, las cuatro sesiones autenticadas y el límite absoluto de ejecución. |
| LIVE V3 | `BYETERY-D324-ONE-LIVE-APPROVAL-V3` y JSON canónico con LF final. Enlaza los digests del manifiesto, grant y permiso de ejecución con una instancia y un desafío. Solo abre la admisión inicial. |
| Admisión | Dominio `BYETERY-D324-ADMISSION-PROOF-V1\n`, digest LIVE, desafío e instancia, firmados por el runner. El servidor verifica preflight mediante su dependencia confiable y revalida quiescencia SQL. La admisión es única en PostgreSQL por pareja, nonce y digests. |
| Escritura | Dominio `BYETERY-D324-WRITE-PROOF-V1\n` con admisión, digest LIVE, deployment, batería, ordinal, comando, método, request ID cuando existe, principal, sesión, clave de idempotencia, hash de acción/cuerpo y expiración. La prueba se acepta hasta 60 s y solo durante la vigencia de la admisión. El servidor reconstruye el contexto desde la ruta y SQL. |

El grant conserva 900 000 ms y exige una observación JWT menor a 600 000 ms al admitir. La ejecución tiene un límite firmado independiente de hasta 75 minutos desde su emisión. La ventana termina como máximo 120 segundos antes del primer vencimiento de las cuatro sesiones, según el JWT validado por el servidor y `auth.sessions.not_after` cuando exista. Cada fase de escritura y de firma/envío vuelve a comprobar las sesiones. Un token renovado con otra expiración no cambia los pines ni amplía el permiso.

El modo candidato recibe las sesiones desde una dependencia interna de autenticación. Guarda los identificadores y fechas de expiración fijados en PostgreSQL privado. No guarda bearer tokens ni claves privadas. El operador actual abre sus sesiones después del gate local de admisión. La futura composición operativa necesitará un flujo ratificado que valide y fije las cuatro sesiones antes de la admisión real.

## Consumo y recuperación

- El coordinador verifica la admisión y el rol de sesión antes de escribir. La transacción liga ordinal, principal, sesión, clave, hash del request e ID de operación. Las cinco operaciones avanzan solo con el prefijo anterior confirmado y proyectado. La repetición con la misma identidad devuelve el ID original. Un cambio de identidad, clave, acción o cuerpo se rechaza.
- Los triggers exigen una reserva en la misma transacción para insertar la batería, encolar una operación, entrar a `PREPARING` o tomar el primer dispatch intent. Un worker anterior no puede utilizar el nuevo encolado para empezar una firma ni despachar.
- El worker revisa la instancia, admisión, expiración, revocación, sesión y rol. Revalida al iniciar el helper y después de comprobar la secuencia de fuente, justo antes de iniciar el transporte. La llamada inicial se inicia bajo el mismo lock de admisión que usa la revocación. El código libera el lock sin esperar la respuesta de red. El intento de despacho se registra antes del envío y su continuación solo se consume una vez.
- H1. Tras las consultas previas y los bloqueos, PostgreSQL calcula el tiempo restante. El proceso descuenta conservadoramente todo el viaje de la consulta con su reloj monotónico. El permiso se usa en el mismo tramo síncrono, justo antes de `spawn` o `fetch`. Revocación, expiración y cambios de lease dejan la identidad durable intacta.
- H2. El cierre revisado requiere una decisión Ed25519 del propietario fijada a admisión, operación, fuente, generación de lease y hash de contexto. Solo acepta `CLAIMED` o `PREPARING` con lease vencida, cero intentos y evidencia coherente de que no existe envelope firmado, comienzo de firma de envelope, identidad incierta ni dispatch intent. Persiste un recibo y termina el par lógico/transporte en la misma transacción. Conserva el paso y su cupo. El cierre histórico previo conserva sus propios predicados. Un START de firma solo deja de ser ambiguo si existe un recibo posterior, de la misma generación, que acredita que el proceso no llegó a iniciar. Si ya hay envelope, una observación del hash original conserva el resultado y mantiene la fuente retenida para revisión.
- M1. PostgreSQL consume y conserva el vencimiento firmado de la PoP. Verifica vigencia al reservar, al encolar y en el trigger diferido de COMMIT. Si vence, el rollback revierte paso, operación, idempotencia y escrituras del flujo.
- Una revocación administrativa puede fijar `revoked_at` una sola vez, mediante el rol interno de mantenimiento. Tras restart, una instancia distinta no adquiere autoridad de firma o envío. Ante `SUBMITTED` o `UNKNOWN`, el worker observa y proyecta exclusivamente la identidad original. La revocación no borra evidencia y no autoriza otro envío. Una transacción ya confirmada conserva su estado y proyección. El retry revisado genérico queda bloqueado para esta pareja.
- `SQL_QUIESCENCE_REJECTED` y el try-lock periódico se preservan. El candidato rechaza trabajo pendiente o incierto, leases activas, devoluciones retenidas ajenas y review intents en espera. Rechaza filas D3 inesperadas respecto del ledger histórico fijado.

Presupuesto fijado en **5 históricas confirmadas, 19 ordinarias, 14 disponibles y 5 pasos RUN1**. RUN2, RUN3 y contingencia #20 quedan excluidos.

## Identidades y revisión siguiente

El operador corregido congelado permanece en `c50e4eb1f7f538a231c5ecfc31d19283998dc234` y la composición en `a6205c43462781eedb300cf50a8a780ae1c32bd7`. El cambio cliente está en un worktree separado y permite presentar una prueba por POST. El SHA prospectivo calculado sin crear un objeto commit es `4735b83a47d29ab8608f4ed8a1237e1fbe9c8636`. Como el plan incluye el SHA del operador, debe recibir un hash nuevo solo tras una decisión posterior. El borrador V2 anterior queda fuera de futura ratificación operativa. La versión futura debe fijar los nuevos bytes y repetir la revisión independiente.

La integración posterior debe componer un emisor de desafío y una ruta privilegiada de admisión con las fuentes de preflight revisadas, configurar los pines autorizados y conectar el proveedor de pruebas del runner. Mantener cerrado el servidor ordinario mientras se revisa el candidato. Validar el cutover de todos los writers antes de cualquier uso operativo.
## Verificación de la revisión anterior

- Candidato de servidor. Suite D3-24 y pruebas de reconciler **8/8** usando PGlite y PostgreSQL 17.6 desechable. Ambos órdenes de la carrera de instalación, admisión y encolado concurrentes, y cierre del fixture confirmados. Incluye cinco pasos sintéticos hasta `SENT` y recuperación de una respuesta perdida mediante el hash original.
- Regresión ordinaria **56/56**. Roles, revocación, worker, persistencia, reconciliación y helper con transportes sintéticos.
- Operador candidato **60/60**. El test de lock entre procesos usó TEMP en el worktree aislado. TypeScript pasó en ambos candidatos.

Cambios de servidor en `backend/src/application/{auth,config,coordinator,d324-authority,d324-scope,http,repository}.ts`, `backend/src/testnet/{rpc,service,store,transport,worker}.ts`, `backend/src/{local-secure-store-signer,stellar-signer}.ts`, la migración `20261112034705_d3_24_reserved_authority.sql`, la suite `backend/tests/d324-authority.test.ts` y este documento. El cambio separado del operador afecta solo `backend/src/d3/live-operator.ts`.
