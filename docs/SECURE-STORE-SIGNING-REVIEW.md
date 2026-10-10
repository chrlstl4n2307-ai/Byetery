# Revisión de firma con Secure Store

Fecha: 2026-09-27. Rama: `codex/testnet-app-integration`. Base: `252fff88d4c4abbb6986460c12f1766b1ddfb574`.

## Resultado

Actualización 2026-10-09: el usuario autorizó implementar el helper y confirmó directamente la firma automatizada de las cuatro identidades de Testnet. El spike compiló usando la biblioteca oficial `soroban-cli = 28.0.0`; se fijaron soroban-spec-tools/typescript en 28.0.0 para respetar su lockfile oficial. El helper y el adaptador TypeScript están implementados y en validación; no se han enviado transacciones. Estado detallado en [LOCAL-SECURE-STORE-SIGNER.md](LOCAL-SECURE-STORE-SIGNER.md). El texto siguiente conserva el diagnóstico histórico de la interfaz de comandos stock del CLI.

Se activa la condición de parada: **Stellar CLI 28.0.0 instalado no expone el flujo requerido de firma de entradas Soroban y devolución de XDR sin envío**. Esto limita su interfaz de comandos, no la capacidad criptográfica del Secure Store. No se implementó CliSecureStoreSigner, no se enviaron transacciones ni se ejecutó la prueba multi-auth de esta fase.

Se consultó primero Stellar Raven / stellarDocs y después la ayuda instalada y código oficial fijado a `v28.0.0`. Versión instalada: `stellar 28.0.0 (300aaf69ab100536678bdb641428b06f06b318ea)`.

## Identidades verificadas

Se ejecutó únicamente `stellar keys address <identity>`, comparando literalmente cada resultado con la dirección esperada. Las cuatro coincidieron. No se solicitó, exportó ni imprimió material privado.

| Identidad | Public key | Resultado |
| --- | --- | --- |
| byetery-tn20260926-admin | GBZ4HNGFYAA7FXRYECY4LBSIKSQPJPUFYJZALOWGTXUURNDR5OINUT2F | MATCH |
| byetery-tn20260926-service | GBOOUYTB4MUH3JQUMOQ6LUEALEPUQ5SREYYIJ5WGR26BI3NCVPNG7WIX | MATCH |
| byetery-tn20260926-collector | GB4YAMSPXTDDUD7FNDE72BD3BKW57BEDM7D7HTX6OFWEFRBO65Z3UO6V | MATCH |
| byetery-tn20260926-recycler | GBIAVN4O4HJSPZJKFPPQZPLPXBELLBGYAJLTEGOGLJG2FRW2C5P35TF2 | MATCH |

## Comandos y comportamiento exacto

| Alternativa | Qué hace | ¿Cumple firma multi-auth sin envío? |
| --- | --- | --- |
| `tx sign --sign-with-key <identity>` | Añade firma al sobre; devuelve XDR. No firma las entradas de autorización Soroban. | No |
| `tx simulate --source-account <identity>` | Recibe envelope, simula y ensambla; devuelve XDR. No llama al firmante de autorizaciones ni al firmante del sobre. | No |
| `contract invoke --build-only` | Devuelve transacción construida antes de ejecutar simulación/firma/envío del flujo principal. | No |
| `contract invoke --send=no` | Devuelve el resultado de simulación y sale antes de firmar. No devuelve un envelope con auth firmadas. | No |
| `contract invoke --send=yes` | Simula, firma auth mediante los signers resueltos, firma sobre y envía/polleea dentro del CLI. | Firma correctamente, pero controla el envío y no cumple el encargo |
| `message sign --sign-with-key <identity>` | Firma SHA-256 del prefijo SEP-53 más mensaje; devuelve firma. `--base64` solo decodifica la entrada. No hay modo raw en este comando. | No; distinto dominio criptográfico |
| `tx send` | Envía y consulta resultado. | No es un proveedor de firma |

`--sign-with-key` selecciona el firmante para las rutas que efectivamente lo usan; no agrega una etapa de firma a `tx simulate`. `--auto-sign` controla la aprobación de auth no estricta cuando se invoca el firmante interno; no es un modo «firmar y retornar». `--auth-mode` selecciona record/root, non-root o enforce de simulación; no produce firmas.

No sirve poner dos firmas de sobre en confirm_collection: la autorización del source SERVICE se satisface con la firma de transacción, pero COLLECTOR necesita su entrada Soroban firmada. Tampoco se deben convertir firmas SEP-53 en firmas de autorización ni interceptar/redirigir el RPC del CLI para simular un modo de firma.

## Evidencia de código oficial

- [tx/sign.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/commands/tx/sign.rs): `run` llama a `sign_with.sign_tx_env` y serializa el envelope.
- [config/sign_with.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/config/sign_with.rs): resuelve identidad y llama a `Signer.sign_tx_env`.
- [signer/mod.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/signer/mod.rs): `sign_tx_env` añade una DecoratedSignature sin modificar auth. La función separada `sign_soroban_authorizations` recibe múltiples signers, valida invocaciones, firma cada entrada adicional y devuelve la transacción modificada, sin envío.
- [tx/simulate.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/commands/tx/simulate.rs): `execute` solo llama a `simulate_and_assemble_transaction`; `run` convierte su resultado a envelope y lo imprime.
- [assembled.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/assembled.rs): simulación y ensamblado no invocan al firmante.
- [contract/invoke.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/commands/contract/invoke.rs): `build_only` retorna `TxnResult::Txn`; la ruta `send=no` retorna el resultado simulado; la ruta de envío llama a `sim_sign_and_send_tx`.
- [tx.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/tx.rs): `sim_sign_and_send_tx` encadena firma de auth, firma del sobre y `send_transaction_polling_with_events`; no tiene una opción de devolver el XDR firmado antes de enviar.
- [message/sign.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/commands/message/sign.rs): `sep_53_sign` añade el prefijo obligatorio y aplica SHA-256.
- [signer/secure_store.rs](https://github.com/stellar/stellar-cli/blob/v28.0.0/cmd/soroban-cli/src/signer/secure_store.rs): existe la primitiva interna `sign_tx_data`, usada por los firmantes; no es un subcomando raw público del ejecutable.

Raven confirmó la separación entre firmas de sobre y de auth mediante [autorización multiparte](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation#example-2-multi-party-authentication) y [firma de invocaciones](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations). La conclusión sobre la interfaz disponible está basada en el código de la versión instalada, no solo en ejemplos documentales.

## Opciones y recomendación

1. **Híbrido SDK + comandos actuales del CLI:** posible para firmas del sobre, insuficiente para el flujo completo con auth adicional. No debe presentarse como resuelto.
2. **Híbrido SDK + extensión local de firma:** técnicamente viable a partir de las primitivas internas que ya utilizan Secure Store. Requeriría un helper/subcomando explícito que reciba XDR, valide red/contrato/método/argumentos/source/signers, firme auth y sobre, y devuelva XDR sin capacidad de enviar. No se ha construido ni probado; no se afirma compatibilidad de empaquetado/API estable. Sería un componente nuevo fuera del contrato, sujeto a revisión, pruebas y autorización antes de implementarlo conforme a esta condición de parada.
3. **Copia externa original:** no es necesaria si se implementa un puente de firma seguro. Si se exige usar únicamente SDK con claves en memoria y el CLI stock, haría falta una copia externa preexistente de las identidades correspondientes; no puede obtenerse mediante `keys secret`. No se presupone que esa copia exista ni se pide enviarla por chat.
4. **Nuevo deployment:** no es necesario por esta limitación. Las identidades actuales siguen accesibles y ya se ha demostrado su correspondencia pública. Solo tendría sentido evaluarlo como último recurso si se perdiera toda vía autorizada de firma/recuperación de las identidades fijas y se descartaran las alternativas; no es la situación acreditada aquí. No se ha redeployado ni cambiado actor alguno.

La propuesta mínima es revisar un helper de firma limitado, reutilizando implementación oficial fijada a versión y Secure Store. No exige modificar Soroban ni debilitar SERVICE + COLLECTOR. Se documenta como propuesta; no se improvisa ni implementa en esta fase detenida.

## Estado final de esta investigación

Solo cambiaron documentos de inspección. No hay transacciones nuevas, ledger ni hashes de multi-auth que reportar. No se ejecutaron suites funcionales, pues no se modificó código de aplicación. No se creó commit ni push de funcionalidad. Se retiró del informe anterior el requisito incorrecto de claves privadas exportadas. No se modifica ni lee el contenido de un eventual `.env.testnet.local` del usuario.
