# Ajustes de presentación de Byetery

Rama: `codex/visual-polish`, basada en `f48759361d89e10bc433a2b6eab5051bf7fe57c2`.

## Respaldo privado

[Byetery en GitHub](https://github.com/chrlstl4n2307-ai/Byetery) se creó como privado,
se verificó su privacidad y el usuario autorizó explícitamente la cuenta/destino.
Los tres checkpoints se comprobaron mediante GitHub API después del envío:

- `767e8f45dd13a3bfb9b041ed2fd00a1b8d3381df` — consolidación.
- `90b7e23081107fcadec0e415da6476b62a4cd41e` — backend HTTP.
- `f48759361d89e10bc433a2b6eab5051bf7fe57c2` — frontend MVP.

Los originales permanecen en sus tres ramas; no se reescribió historial.
El respaldo Git no incluye secretos, dependencias, compiladores ni builds ignorados.

## Cambios

- Avatar y menú de cuenta accesible; correo dentro del desplegable y rol obtenido
  de la API. No se infiere ni inventa un nombre personal.
- Estados principales en español, con códigos originales conservados en texto
  secundario/detalles técnicos. Permanecen visibles DEV y MOCK.
- “Batería” como término general. El tipo de la demostración es “Pila AA alcalina”.
- Recompensa destacada y “Ciclo completado” solo con `RECYCLED` y `SENT`
  confirmados. Sin cambios de solicitudes, idempotencia o autorizaciones.
- [Alcance de la demo y guion para presentaciones](../DEMO-SCOPE.md): el mock no
  ejecuta Soroban. La demo CLI en memoria es offline; la web requiere Supabase DEV.

## Validación

- TypeScript y ESLint: correctos.
- Frontend: 33/33 pruebas aprobadas, incluyendo textos de estados y confirmación de recompensa.
- Build de producción: exit 0; auditoría de 17 artefactos sin secretos privilegiados.
- `npm run verify`: exit 0; Rust 20/20, suite con WASM 20/20 + 1/1, fmt, Clippy,
  Backend Foundation 50/50, Python 4/4 y demo CLI completos.
- Demo real Edge: exit 0; BYE-7025EE1EF456F4, SENT 10 GREEN-TEST; cuenta, permisos, Origin, logout y móvil correctos.
- Sin diferencias en `backend/`, `contracts/` ni `database/` frente al checkpoint anterior.
- Historial y archivos candidatos: sin secretos detectados. `git diff --check`: correcto.

SHA-256 de WASM, sin cambios:

`c2bc80b26d3a1a265a1d4d1923b503f6558fdd7c1489f81b0de8f5ee18f6ceb6`

Los logs `visual-polish-*.log` y capturas se conservan localmente en `.tools/verification/`,
ignorados. Este checkpoint no añade wallet gráfica, cámara, adaptador Testnet ni despliegues.
