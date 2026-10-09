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
| `TEST_SUPABASE_ANON_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` | llaves NUEVAS del proyecto de pruebas: `sb_publishable_…` y `sb_secret_…` (clave `ci_rotada_20261008`). Las legacy JWT (anon/service_role) están **deshabilitadas** desde el 08-oct: la service_role legacy se expuso en la salida de una herramienta. No re-habilitarlas |
| `TEST_E2E_USER_EMAIL` / `TEST_E2E_USER_PASSWORD` | usuario E2E de la base de pruebas (`e2e-test@golfersplus-test.local`) |
| `TEST_DB_PASSWORD` | contraseña de Postgres del proyecto de pruebas (solo local; ningún script la usa hoy) |

`SUPABASE_ACCESS_TOKEN` (el de la Management API) está en GitHub sólo dentro del environment **`base-de-pruebas`**,
restringido a la rama `main`: un PR no puede leerlo.

## Scripts (`scripts/test-db/`)

- **Prod siempre en solo lectura:** `scripts/lib/management-sql.mjs` manda `read_only: true` en toda consulta a prod
  (corre como `supabase_read_only_user`), la pida o no el script.
- **`sync-schema.mjs`** — reconstruye `public` en la base de pruebas desde los catálogos de prod (sólo lectura,
  Management API) en UNA transacción, y después compara una huella de ~3.400 objetos (columnas, constraints,
  índices, funciones y tablas con su dueño, triggers, policies de `public` y `storage`, privilegios de tabla/columna/
  función y del esquema `public`, default ACL de todos los roles, buckets). El DDL va en un solo intento (sin reintento). Falla si
  algo difiere. `--sql out.sql` sólo genera el SQL; `--verificar` sólo compara.
  No clona: `pg_cron`, `pg_net`, `cron.job`, la publicación `supabase_realtime`, los datos.
- **`seed.mjs`** + **`seed-manifest.json`** — copia el catálogo completo (courses, course_holes, course_tees,
  golf_rules, pesos/fuentes del coach) y las filas fijas que leen los tests (torneos `gate-scorer-*`, rondas
  `GATEB2*` con la demo `GATEB2BN`). Reescribe toda columna de persona al usuario sintético del seed y **aborta**
  si una fila trae el id de un usuario real. Aborta también si una fila trae un email fuera de `@golfersplus-test.local`. Las cuentas `@golfersplus-test.local` se
  CONSERVAN (ids estables; aborta si hay otras): crea las que falten, repone su fila de `profiles` (el rebuild la borra)
  y alinea la contraseña del usuario E2E con el secret. El usuario E2E se crea con `scripts/setup-e2e-user.mjs`.
  Un test nuevo que lea una fila fija de prod → agregarla al manifiesto.
- **`con-base-de-pruebas.mjs`** — corre un comando con las variables de Supabase apuntando a la base de pruebas.
- **`proyectos.mjs`** — guarda única: el destino tiene que llamarse `golfersplus-test` y no ser prod.

```bash
node --env-file=.env.local scripts/test-db/sync-schema.mjs     # tras un cambio de esquema en prod
node --env-file=.env.local scripts/test-db/seed.mjs
node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- node node_modules/vitest/vitest.mjs run src/__tests__/integration
```

Antes de correrlos a mano: `evento-en-vivo.mjs` (leen prod).

## Workflows

- `test-db-sync.yml`: diario 05:00 UTC + manual. Ping de keep-alive → chequeo de evento en vivo (si hay, se salta
  el sync sin fallar) → `sync-schema` → `seed` → Telegram si falla.
- `integracion.yml` (desde el 09-oct, frente 3.3): cada PR/push corre `src/__tests__/integration` (incluido el
  canario de importación, que antes era `import-canary.yml`) **contra esta base**, vía `con-base-de-pruebas.mjs`.
  No recibe ningún secret de prod: 0 peticiones a prod por PR (antes ~390). El barrido de basura también va acá.
  Lo vigila `scripts/ci/integracion-sin-prod.test.mjs`.
- Los dos comparten el grupo de concurrencia `base-de-pruebas` (el rebuild vacía `public`): un PR que llega justo
  a las 05:00 UTC espera al sync. En un grupo GitHub deja una corrida en curso y UNA pendiente: si llega una
  tercera, la pendiente anterior queda "cancelled" y se re-corre con `gh run rerun`.

## Lo que esta base NO cubre (vive en `src/__tests__/prod/`, corre en `prod-canarios.yml`)

Lo que verifica el DATO de prod, no el código. Corre de noche (06:30 UTC) contra prod, con turno de prod y
evento en vivo, y avisa por Telegram si falla. Reemplaza a `catalogo-canary.yml`.

- `catalogo-rating-canary` y `catalogo-par-por-hoyo.canary`: el catálogo que entra por SQL/sync/admin.
- `privilegios-tablas` y `profiles-privilegios`: los privilegios reales de prod (migraciones aplicadas a mano).
- `coach-e2e`: necesita un usuario real con historial (la cuenta de Juanjo).
- Además barre la basura que dejan los E2E de Playwright en prod (siguen contra prod hasta el frente 3.4).

Un cambio de esquema en prod llega a la base de pruebas en el sync siguiente (o corriendo `sync-schema` a mano).

## Pendiente (frente 3.4): E2E de Playwright

Siguen contra PROD: `scorer-smoke.yml` (en cada PR), `e2e-trigger.yml`, `e2e-auth-weekly.yml`, `qa-crawler.yml`.
Moverlos exige levantar la app apuntada a la base de pruebas (build con `NEXT_PUBLIC_SUPABASE_URL` de pruebas o un
preview de Vercel con esas variables) y sembrar lo que cada spec lee (p. ej. `COURSE_ID` fijos en
`e2e/http-smoke.ts`, `e2e/rondas-existentes.spec.ts`, `e2e/score-grupo-finalize-missing.spec.ts`).
