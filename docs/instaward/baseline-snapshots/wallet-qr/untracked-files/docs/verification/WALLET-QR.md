# Wallet y QR — validación

Fecha: 2026-09-14. Rama: `codex/wallet-qr`.
Base conservada: `0a572af29b6d4df6c16feb0329ecc225948824f6`.

## Implementación

- Nuevos challenges SEP53_V2, mensaje UTF-8 determinista, nonce aleatorio, expiración y consumo atómico. Legacy limitado a desafíos ya emitidos; versión seleccionada por servidor y protegida en storage.
- Adaptador independiente de wallet con Freighter oficial; comprobación de dirección, red y firma. No se almacenan claves privadas.
- Escáner QR en Dashboard, Collector y Recycler, con fallback jsQR, entrada manual y cierre de tracks. El QR solo consulta; no confirma operaciones.
- Lectura de solicitud operativa limitada a operadores con ambos roles habilitados. Sin datos personales ni destinatarios ajenos.
- Dos migraciones aplicadas exclusivamente a Supabase DEV. Contrato Soroban sin cambios.

## Resultados automatizados

| Verificación | Resultado |
| --- | --- |
| `npm run verify` | PASS: Rust nativo 20/20, WASM 1/1, release, fmt, Clippy; backend 65/65; Python 4/4 y demo MOCK |
| Tests HTTP contra Supabase DEV | 45/45 |
| SQL / PGlite | 82/82 |
| SQL / Supabase DEV | 82/82 |
| Frontend, después del ajuste de límites exactos | 78/78 |
| Build final / TypeScript / ESLint | PASS |
| Auditoría de bundle frontend | 20 artefactos; sin secretos privilegiados |
| npm audit frontend y backend | 0 vulnerabilidades reportadas |
| `npm run demo:api` | REGISTERED → RETURNED → COLLECTED → RECYCLED → SENT; 10 GREEN-TEST; MOCK |
| `npm run demo:qr` | Mismo flujo completo vía frontend/API/Supabase DEV; QR generado decodificado con jsQR y stream sintético; tracks detenidos |
| `git diff --check` | PASS |

WASM SHA-256 conservado: `c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`.

Evidencia local ignorada por Git: `.tools/verification/wallet-qr-full.log`, `wallet-qr-http.log`, `wallet-qr-sql.log`, `wallet-qr-final-tests.log`, `wallet-qr-final-build.log`, `wallet-qr-api-demo.log`, `wallet-qr-demo.log` y capturas `frontend-desktop.png` / `frontend-mobile.png`.

## Pendiente antes del checkpoint

La demo automática usa un firmante de pruebas Node y una cámara sintética: no sustituye la firma en la extensión Freighter ni el escaneo con cámara física. Chrome fue elegido por el usuario. La aplicación está preparada para iniciar sesión y realizar esas pruebas manuales.

No se crea commit ni se hace push hasta completar esas comprobaciones. Los cambios permanecen en la rama de trabajo. No se conecta Stellar Testnet ni se despliega a Vercel. La demo MOCK no ejecuta Soroban; Rust conserva su suite separada.

Advisor de Supabase: sin hallazgos nuevos tras fijar search_path del trigger; sigue el aviso previo de protección de contraseñas filtradas desactivada. No se modificó la configuración de Auth.

Detalles de protocolo, límites y ejecución: [WALLET.md](../WALLET.md), [CAMERA-QR.md](../CAMERA-QR.md), [HTTP-API.md](../HTTP-API.md).
