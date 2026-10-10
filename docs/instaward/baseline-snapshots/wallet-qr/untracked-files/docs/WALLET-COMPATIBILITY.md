# Diagnóstico histórico de compatibilidad de wallet

> Actualización: el usuario aprobó SEP-53 con emisión exclusiva v2 y legacy solo histórico. La implementación y su formato definitivo están en [WALLET.md](WALLET.md). El resto de este documento registra el diagnóstico previo, no el estado actual.

Fecha: 2026-09-13. Base: `0a572af29b6d4df6c16feb0329ecc225948824f6`.

Estado: incompatibilidad confirmada; propuesta pendiente de aprobación. No se han instalado dependencias ni implementado wallet gráfica o cámara. Se respeta la instrucción del encargo: «Detente, documenta la incompatibilidad y propón el cambio mínimo y seguro necesario».

## Proveedor evaluado

Freighter, mantenido en la organización Stellar, expone firma de mensajes con separación de dominio SEP-53. El registro npm consultado informa `@stellar/freighter-api` 6.0.1, licencia Apache-2.0. No se instaló el paquete. El código oficial examinado demuestra que su formato no coincide con el verificador actual.

Fuentes consultadas:

- [Implementación oficial de Freighter, encodeSep53Message](https://github.com/stellar/freighter/blob/master/extension/src/helpers/stellar.ts).
- [SEP-53, Sign and Verify Messages, versión 1.0.0](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md).

## Formato actual comprobado en el repositorio

`backend/src/application/wallet.ts` construye bytes UTF-8 mediante `Buffer.from(JSON.stringify(...))`, sin espacios ni salto de línea final, con propiedades en este orden:

```text
domain, purpose, version, id, userId, network, networkId, address, nonce, expiresAt
```

- `domain`: `byetery-dev`; `purpose`: `LINK_WALLET`; `version`: 1.
- `id`: UUID generado en el servidor; `userId`: usuario de aplicación obtenido de la sesión autenticada.
- `network`: `Testnet`; `networkId`: identificador de red de la configuración del deployment. Es contexto firmado, no una conexión a Stellar.
- `address`: dirección G con validación del SDK.
- `nonce`: 32 bytes CSPRNG codificados en hexadecimal.
- `expiresAt`: ISO UTC, diez minutos desde el reloj de PostgreSQL.

La API devuelve estos bytes en `messageBase64`; Base64 es transporte, no el mensaje que se firma. Conserva los bytes originales en `api_private.wallet_challenges.message_bytes`. El verificador aplica Ed25519 directamente a esos bytes, sin prefijo ni hash de mensaje adicional de aplicación.

La verificación busca el challenge por deployment, ID y propietario con `FOR UPDATE`. Rechaza challenges consumidos, expirados o con cinco intentos. Incrementa el intento y consume el nonce junto con la vinculación de wallet dentro de la transacción. Los campos de contexto y mensaje tienen protección de inmutabilidad. La interfaz independiente `WalletVerifier` se conserva.

## Incompatibilidad demostrada

Sea `M` el JSON exacto codificado en UTF-8:

```text
Byetery actual: Ed25519.verify(publicKey, M, signature)
Freighter:     Ed25519.sign(privateKey, SHA256(UTF8("Stellar Signed Message:\n") || M))
```

El prefijo incluye un salto de línea LF real. Ambas usan Ed25519, pero sobre mensajes distintos. No corresponde usar firma de transacciones ni transformar artificialmente el challenge para intentar eludir esta diferencia.

Se ejecutó una prueba criptográfica local con el SDK ya instalado y el `Ed25519WalletVerifier` real. La clave aleatoria existió únicamente en memoria; no se imprimió ni guardó. Resultado de cuatro aserciones:

| Comprobación | Resultado esperado y observado |
| --- | --- |
| Firma directa del JSON aceptada por el verificador actual | Sí |
| Firma SEP-53 aceptada por el verificador actual | No |
| Firma SEP-53 válida sobre el digest correcto | Sí |
| Modificar los bytes conserva una firma válida | No |

El SDK instalado expone `Keypair.signMessage` y `Keypair.verifyMessage`. Antes de usarlos en una implementación se comprobarán contra los vectores oficiales SEP-53. La prueba anterior comprueba la incompatibilidad con criptografía real; no representa una firma manual realizada en la extensión.

## Cambio mínimo propuesto, aún no aplicado

1. Versionar el esquema de firma del challenge en el servidor y persistirlo como campo inmutable: registros existentes `RAW_ED25519_V1`, nuevos challenges `SEP53_V1`. Los nuevos mensajes usarían versión 2 e incluirían el esquema de firma, conservando todos los campos de contexto actuales. Una migración nueva no reescribirá migraciones históricas.
2. El verificador elegirá exclusivamente el esquema almacenado para ese challenge. No probará ambos formatos ante un fallo ni aceptará un esquema enviado por el cliente en `/verify`. Los challenges históricos seguirán su esquema hasta expirar; no se invalidarán vínculos ya verificados.
3. Mantener los endpoints. Añadir información explícita de esquema a la respuesta del challenge. El adaptador decodificará el Base64 a UTF-8 exacto y entregará ese texto a Freighter sin reserializar, recortar, anteponer el prefijo ni aplicar hash previamente. El proveedor realiza SEP-53; el backend verifica el mismo formato mediante el SDK oficial.
4. Mantener CSPRNG, propietario autenticado, dirección, propósito, red, dominio, expiración, consumo único atómico y protección contra replay. Adaptar la firma de las demos CLI al esquema emitido por el servidor; no cambiar las reglas del mock ni del contrato.
5. Añadir pruebas de compatibilidad y rechazo de formatos cruzados, mensaje alterado, cuenta distinta, expiración, consumo único y cambio de cuenta durante la firma. Las pruebas existentes se conservan y se ajusta únicamente la preparación de firmas donde el nuevo protocolo lo requiera.

Después de aprobar el cambio, la interfaz independiente `WalletAdapter` encapsulará disponibilidad, conexión y firma. La UI mostrará VERIFIED solo tras confirmación del backend. Esta prueba acredita control de la clave de una dirección G; no comprueba existencia de cuenta en red ni autorización completa de una cuenta multisig.

## Estado del proyecto y trabajo pendiente

- Git estaba limpio al iniciar; HEAD coincide con el checkpoint solicitado.
- Comparación del directorio del contrato con `767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df`: sin diferencias.
- WASM conservado, SHA-256: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.
- No se modificaron código funcional, migraciones, configuración global ni protecciones de Windows.
- No se ejecutó aún la validación completa del nuevo encargo: suites frontend/backend/HTTP/SQL/Rust/Python, builds, auditoría de dependencias y demo deben repetirse antes de integrar y publicar el resultado. Los resultados de checkpoints anteriores no se presentan como una nueva ejecución.
- Firma real con extensión y lectura con cámara real en Edge: pendientes. QR y flujo completo de la nueva integración: pendientes.
- No se conectó Stellar Testnet ni se desplegó en Vercel. Las operaciones de la demo continúan usando MockStellarService; no ejecutan Soroban.
- No corresponde crear el commit de funcionalidad ni hacer push hasta implementar y validar lo solicitado.
