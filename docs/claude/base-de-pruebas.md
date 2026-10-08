# Base de pruebas (`golfersplus-test`)

> Creada el 08-oct-2026, frente 3.2 del incidente del torneo Los Leones (`docs/INCIDENTE_TORNEO_LEONES_2026-10-04.md`):
> el CI y los tests de integración le pegaban a la BD de PRODUCCIÓN (Supabase Free/Nano) y ayudaron a tumbarla.

## Qué es

- 2º proyecto Supabase en la misma org (`dfcnuwmteikdxcrppgeg`, plan **free**): ref `qdrbjdfhqbotanocipxf`,
  región `sa-east-1`, sin add-ons → **$0**. Verificado al crearlo: org `plan: free`, `selected_addons: []`.
- Esquema = copia de `public` de prod viva, reconstruida cada día. Datos = catálogo de canchas + fixtures de los
  tests. **Nunca datos de usuarios reales**: las cuentas son sintéticas (`@golfersplus-test.local`).
- Se pausa sola tras 7 días sin actividad (regla de Supabase Free): el workflow diario la mantiene viva. Si igual
  quedara pausada: dashboard → Restore, o `POST /v1/projects/qdrbjdfhqbotanocipxf/restore`.

## Variables

En `.env.local` (y como secrets del repo en GitHub, salvo la contraseña de Postgres):

| Variable | Qué es |
|---|---|
| `TEST_SUPABASE_URL` | `https://qdrbjdfhqbotanocipxf.supabase.co` |
| `TEST_SUPABASE_ANON_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` | llaves del proyecto de pruebas |
| `TEST_E2E_USER_EMAIL` / `TEST_E2E_USER_PASSWORD` | usuario E2E de la base de pruebas (`e2e-test@golfersplus-test.local`) |
| `TEST_DB_PASSWORD` | contraseña de Postgres del proyecto de pruebas (solo local; ningún script la usa hoy) |

`SUPABASE_ACCESS_TOKEN` (el de la Management API) está en GitHub sólo dentro del environment **`base-de-pruebas`**,
restringido a la rama `main`: un PR no puede leerlo.

## Scripts (`scripts/test-db/`)

- **`sync-schema.mjs`** — reconstruye `public` en la base de pruebas desde los catálogos de prod (sólo lectura,
  Management API) en UNA transacción, y después compara una huella de ~3.400 objetos (columnas, constraints,
  índices, funciones, triggers, policies, privilegios de tabla/columna/función, default ACL, buckets). Falla si
  algo difiere. `--sql out.sql` sólo genera el SQL; `--verificar` sólo compara.
  No clona: `pg_cron`, `pg_net`, `cron.job`, la publicación `supabase_realtime`, los datos.
- **`seed.mjs`** + **`seed-manifest.json`** — copia el catálogo completo (courses, course_holes, course_tees,
  golf_rules, pesos/fuentes del coach) y las filas fijas que leen los tests (torneos `gate-scorer-*`, rondas
  `GATEB2*` con la demo `GATEB2BN`). Reescribe toda columna de persona al usuario sintético del seed y **aborta**
  si una fila trae el id de un usuario real. Borra y recrea las cuentas `@golfersplus-test.local` (aborta si hay
  otras) y crea el usuario E2E con `scripts/setup-e2e-user.mjs` apuntado a la base de pruebas.
  Un test nuevo que lea una fila fija de prod → agregarla al manifiesto.
- **`con-base-de-pruebas.mjs`** — corre un comando con las variables de Supabase apuntando a la base de pruebas.
- **`proyectos.mjs`** — guarda única: el destino tiene que llamarse `golfersplus-test` y no ser prod.

```bash
node --env-file=.env.local scripts/test-db/sync-schema.mjs     # tras un cambio de esquema en prod
node --env-file=.env.local scripts/test-db/seed.mjs
node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- node node_modules/vitest/vitest.mjs run src/__tests__/integration
```

Antes de correrlos a mano: `evento-en-vivo.mjs` (leen prod).

## Workflow

`.github/workflows/test-db-sync.yml`: diario 05:00 UTC + manual. Ping de keep-alive → chequeo de evento en vivo
(si hay, se salta el sync sin fallar) → `sync-schema` → `seed` → Telegram si falla. Grupo de concurrencia
`base-de-pruebas`: los workflows que corran tests contra esta base deben usar el mismo grupo (el rebuild vacía
`public` y recrea las cuentas).

## Lo que esta base NO cubre

- `coach-e2e.test.ts` necesita un usuario real con historial: sigue siendo de prod (o se excluye).
- Los canarios de catálogo (`catalogo-*-canary`) vigilan el DATO de prod: corren contra prod en
  `catalogo-canary.yml`. Contra la base de pruebas pasan, pero sólo prueban la copia del día.
- Un cambio de esquema en prod llega a la base de pruebas en el sync siguiente (o corriendo `sync-schema` a mano).
