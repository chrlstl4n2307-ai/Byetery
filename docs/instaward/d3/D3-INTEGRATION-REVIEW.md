# D3 V3 · Guía de revisión offline

`SECURITY_STATUS = HOLD` · `AUTH_B_V2 = NOT_RATIFIED` · `PRE-LIVE = NO` · `LIVE = NO` · `TX20 = NO` · `OPTION_A_APPROVED = NO`.

## Identificar el código

Use un clon con historial completo. Desde la raíz coteje el checkpoint integrado validado con su padre. El alcance de ese checkpoint es de 40 rutas, 13 modificadas y 27 nuevas. Si revisa un sucesor, compruebe además el SHA y árbol entregados para ese sucesor y revise su delta por separado.

~~~powershell
$base = 'f1b4309b1d14260a8302d828dab5dd2fcdf0aa8b'
$checkpoint = '622b5c701e63045dfaed38e17bb60ec2709faab5'
git --no-replace-objects show -s --format='%H%n%P%n%T' $checkpoint
git --no-replace-objects diff --name-status $base $checkpoint
git --no-replace-objects diff --check $base $checkpoint
~~~

El resultado esperado del primer comando es el checkpoint, su padre `$base` y el árbol `61cb6668cabd2fc437c4d56a3385064b1842c89f`. Si el checkpoint quedó fuera de la ascendencia de la publicación, coteje primero el objeto publicado contra la base con los mismos comandos, usando el SHA publicado en lugar de `$checkpoint`. El inventario sanitizado del paquete externo acredita la correspondencia entre los 40 blobs originales y el árbol publicado.

El operador `d85e54e00e98c8d8bc6294c883708a701ce55440` se conserva en `instaward/d3-24-operator` y la procedencia de captura `496f891463c4476fe6f9e267232e072b754d02fb` en `instaward/d3-24-capture`. El plan RUN1 tiene SHA-256 `0435d8436d13881ebbdf31e729cf36a80e538bc149300219353f68817b37d72d`. [Plan](../../../tools/d3-24-composition/plans/security-repair-v2.json) · [Ledger externo](../../../tools/d3-24-ratification/external-project-ledger.jsonl) · [Pines H2](../../../tools/d3-24-operational/h2/pins.json) · [Identidad del contrato y WASM](../../checkpoints/frozen-contract.json)

## Ejecutar la revisión

Siga los comandos del perfil V3 en una sesión de laboratorio con dependencias cacheadas y datos sintéticos. Use el checkout integrado para las pruebas del manifiesto, H2 y la composición sintética. Use un worktree separado en la base publicada para la prueba positiva de identidad del lanzador. Si las versiones o hashes de herramientas no coinciden, registre el bloqueo de esa comprobación. Los pines permanecen fijos. [README operativo V3](../../../tools/d3-24-operational/README.md)

La revisión no requiere sesiones Auth reales, una instancia Supabase alojada ni acceso a Stellar. Los perfiles históricos de captura y composición requieren sus checkouts y fixtures fijados. Para verificar un paquete externo hace falta un checkout limpio y la aprobación independiente correspondiente. La verificación del paquete solo da un resultado de revisión.

## Seis negativos D3.3

| Caso SOW | Resultado esperado |
|---|---|
| Recycler no autorizado | `RoleNotGranted`, lifecycle y saldo intactos, cero envíos. |
| Registro alterado | La divulgación alterada devuelve `NOT_VERIFIED` al compararla con el compromiso original. |
| Recompensa temprana | `RewardNotEligible`, saldo intacto. |
| Recompensa duplicada | `RewardAlreadySent`, cero pagos adicionales. |
| Transición inválida | Reciclaje antes de colección rechazado, proyección intacta. |
| ACK incierto | Un solo intento y recuperación del ID y hash originales sin reenvío. |

El registro D3-1 acredita estos casos en laboratorio. Su aceptación y la evidencia exigida para la entrega final siguen pendientes. [Resultados D3-1](D3-1-BUILD-2026-11-02.md#L42) · [Casos de código](../../../backend/src/d3/negatives.ts)

## Procedencia y artefactos externos

| Evidencia | Qué acredita | Dónde revisarla |
|---|---|---|
| Testnet histórico | BYE0001 corresponde a un ciclo histórico. D3-23 confirmó solo el registro de un intento incompleto, en el ledger `5682924`, con hash `b03fef3783f9cab7cae9515f617b3e2bccb85d15c4091b1dee13b6d0b7057b53`. | [Ledger externo](../../../tools/d3-24-ratification/external-project-ledger.jsonl) |
| Laboratorio sintético | D3-29 correlacionó cinco pasos entre API, worker, SQL, journal y exportación. La recuperación integrada tras pérdida de ACK y el perfil RUN3 exacto tienen evidencia separada. | Pruebas versionadas y paquete de evidencia sintética sanitizado, si se entrega. |
| Verificación integrada y H2 | Resultados offline, inventario SHA-256 y controles del supervisor bajo identidades de laboratorio. | El repositorio aporta código y pines. Los logs, comprobantes de PostgreSQL desechable y resultados nativos requieren un paquete externo. |
| Firmante y ratificación | El descriptor identifica los bytes esperados y la política de custodia en revisión. | El ejecutable protegido, atestaciones de acceso, K5/session-control, manifiesto y aprobaciones se custodian fuera del clon. |

La compatibilidad de Auth alojado y FORCE RLS sigue pendiente. D3 conserva 0/5 criterios aceptados y 0/3 ciclos frescos completos en Testnet.
