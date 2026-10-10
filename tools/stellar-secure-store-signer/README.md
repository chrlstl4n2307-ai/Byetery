# Firmante local Secure Store

Estado: spike de biblioteca compilado; helper implementado; pruebas nativas y de firma offline en curso. No se considera validado hasta completar esas pruebas.

Crate independiente del workspace del contrato. `soroban-cli = 28.0.0` aporta `sign_soroban_authorizations` y el firmante Secure Store. El programa valida el XDR antes de acceder al firmante, firma entradas/sobre y devuelve JSON por stdout. No consulta RPC ni envía transacciones.

La dependencia oficial evita copiar código de custodia. Su feature `additional-libs`, necesaria para Secure Store, agrupa también wasm-opt y stellar-ledger. El lockfile inicial resuelve 649 paquetes, incluidos los de diferentes plataformas. Este coste y el acoplamiento a APIs públicas de implementación del CLI deben evaluarse antes de adoptar el componente.

```powershell
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action test
pwsh -NoProfile -File scripts/verify-secure-store-signer.ps1 -Action build
node --experimental-strip-types --test backend/signing-tests/offline.test.ts
```

En este equipo se reutiliza la toolchain local GNU con rust-lld. No se modifica el CLI global ni las protecciones del sistema. Build y caches están ignorados. Un check correcto probaría disponibilidad de símbolos y compilación, no funcionamiento de firma ni seguridad completa.

Valida Testnet, contrato fijo, un solo InvokeHostFunction, método permitido, tipos/argumentos, source esperado, entradas auth exactas sin subinvocaciones inesperadas, signers fijos, límite de fee y expiración. Rechaza identidades proporcionadas por entrada, firmas previas y formatos no soportados. Su salida es JSON acotado con XDR firmado y public keys; los errores son códigos constantes. Las pruebas offline con Secure Store usan sequence=1 y auth expiry=100, inválidas en la red actual, sin envío.

Política, protocolo JSON, versiones y límite de confianza: [LOCAL-SECURE-STORE-SIGNER.md](../../docs/LOCAL-SECURE-STORE-SIGNER.md).

Este helper es infraestructura local de desarrollo/Testnet. No representa el modelo final de custodia o firma para producción/Mainnet.
