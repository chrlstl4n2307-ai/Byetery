# Database

`migrations/` contiene la migración original de Backend Foundation, sin cambios SQL.
La prueba `backend/tests/database.test.ts` carga esta ubicación y ejecuta PostgreSQL
embebido PGlite. No se utiliza Supabase remoto.

Ejecutar desde la raíz: `npm run test:backend`.
