# Base de pruebas (`golfersplus-test`)

> Creada el 08-oct-2026, frente 3.2 del incidente del torneo Los Leones (`docs/INCIDENTE_TORNEO_LEONES_2026-10-04.md`):
> el CI y los tests de integración le pegaban a la BD de PRODUCCIÓN (Supabase Free/Nano) y ayudaron a tumbarla.

## Qué es

- 2º proyecto Supabase en la misma org (`dfcnuwmteikdxcrppgeg`, plan **free**): ref `qdrbjdfhqbotanocipxf`,
  región `sa-east-1`, sin add-ons → **$0**. Verificado al crearlo: org `plan: free`, `selected_addons: []`.
- Esquema = copia de `public` de prod viva, reconstruida cada día. Datos = catálogo de canchas + fixtures de los
  tests, versionados en `scripts/test-db/seed-data/`. **Nunca datos de usuarios reales**: las cuentas son sintéticas
  (`@golfersplus-test.local`).
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
restringido a la rama `main`: un PR no puede leerlo. `sync-schema` lee el esquema de prod y los dos scripts escriben
en la base de pruebas: el token tiene que cubrir los dos proyectos. No está en ningún `.env.local`.

## Scripts (`scripts/test-db/`)

- **Prod siempre en solo lectura:** `scripts/lib/management-sql.mjs` manda `read_only: true` en toda consulta a prod
  (corre como `supabase_read_only_user`), la pida o no el script.
- **`sync-schema.mjs`** — reconstruye `public` en la base de pruebas desde los catálogos de prod (sólo lectura,
  Management API) en UNA transacción, y después compara una huella de ~3.400 objetos (columnas, constraints,
  índices, funciones y tablas con su dueño, triggers, policies de `public` y `storage`, privilegios de tabla/columna/
  función y del esquema `public`, default ACL de todos los roles, buckets). El DDL va en un solo intento (sin reintento). Falla si
  algo difiere. `--sql out.sql` sólo genera el SQL; `--verificar` sólo compara.
  No clona: `pg_cron`, `pg_net`, `cron.job`, la publicación `supabase_realtime`, los datos.
- **`seed.mjs`** + **`seed-manifest.json`** + **`seed-data/`** — siembra lo que está en `seed-data/<tabla>.json`
  (exportado de prod el 19-oct-2026; el seed no habla con prod): el catálogo de canchas (courses, course_holes,
  course_tees), golf_rules, pesos y fuentes del coach, modelos LLM, priors externos y las filas fijas que leen los
  tests (torneos `gate-scorer-*`, rondas `GATEB2*` con la demo `GATEB2BN`). En `seed-data` las columnas de persona
  traen null o el rol del manifiesto (`dueno`), que el seed cambia por el id de la cuenta sintética; **aborta** si
  traen otra cosa o si una fila trae un email fuera de `@golfersplus-test.local`. Las cuentas `@golfersplus-test.local` se
  CONSERVAN (ids estables; aborta si hay otras): crea las que falten, repone su fila de `profiles` (el rebuild la borra)
  y alinea la contraseña del usuario E2E con el secret. El usuario E2E se crea con `scripts/setup-e2e-user.mjs`.
  Un test nuevo que necesite una fila fija → agregarla a `seed-data` con datos inventados (nunca copiados de un
  usuario real) y, si es una tabla nueva, al manifiesto.
- **`con-base-de-pruebas.mjs`** — corre un comando con las variables de Supabase apuntando a la base de pruebas.
- **`proyectos.mjs`** — guarda única: el destino tiene que llamarse `golfersplus-test` y no ser prod.

```bash
node --env-file=.env.local scripts/test-db/sync-schema.mjs     # solo vía workflow (necesita SUPABASE_ACCESS_TOKEN)
node --env-file=.env.local scripts/test-db/seed.mjs            # solo vía workflow (necesita SUPABASE_ACCESS_TOKEN)
node --env-file=.env.local scripts/test-db/con-base-de-pruebas.mjs -- node node_modules/vitest/vitest.mjs run src/__tests__/integration
```

`sync-schema` y `seed` necesitan `SUPABASE_ACCESS_TOKEN`, que no está en ningún `.env.local`: se corren con el
workflow (`gh workflow run test-db-sync.yml`).

## Proyectos de vitest (desde el 14-oct)

`vitest.config.mts` separa los tests por carpeta. `unit` es todo lo que no está en las otras dos: lo corren
`npm run test`, el hook de pre-push y `ci.yml`, y `src/__tests__/setup/offline-env.ts` le borra las credenciales de
Supabase, así que nunca toca una base aunque la terminal las tenga cargadas. `integration`
(`src/__tests__/integration`) corre contra esta base vía `con-base-de-pruebas.mjs` y aborta si la URL es la de prod
(`src/__tests__/setup/test-db-guard.ts`). `prod` (`src/__tests__/prod`) es lo de la sección de abajo. Un test que
necesita base va en `integration` o en `prod`, nunca en `unit`. El proyecto `prod` solo existe con `VITEST_PROD=1`,
que definen `prod-canarios.yml` y `migraciones-prod.yml`: sin ella, `npx vitest run` corre `unit` e `integration`.

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
evento en vivo, y avisa por Telegram si falla. Reemplaza a `catalogo-canary.yml`. Nada local lo corre: el proyecto
`prod` de Vitest necesita `VITEST_PROD=1`, que solo definen ese workflow y `migraciones-prod.yml`.

- `catalogo-rating-canary`, `catalogo-escala-rating` y `catalogo-par-por-hoyo.canary`: el catálogo que entra por
  SQL/sync/admin (la base de pruebas tiene una copia fija).
- `privilegios-tablas` y `profiles-privilegios`: los privilegios reales de prod (migraciones aplicadas a mano).
- `coach-e2e`: necesita un usuario real con historial (la cuenta de Juanjo).
- Además barre la basura que dejan en prod los E2E que todavía la tocan (el scorer smoke programado, ci.yml y e2e-trigger).

Un cambio de esquema en prod llega a la base de pruebas en el sync siguiente (o con `gh workflow run test-db-sync.yml`).

## E2E de Playwright (frente 3.4, desde el 12-oct)

`scripts/test-db/e2e-local.mjs` compila la app con las variables de la base de pruebas (las `NEXT_PUBLIC_*` quedan
horneadas en el bundle), la levanta con `next start` en `localhost:3000`, corre Playwright contra ella y la apaga.
Usa el mismo mapeo de `con-base-de-pruebas.mjs` (aborta si falta un `TEST_*` o si la URL de pruebas es la de prod).

```bash
node --env-file=.env.local scripts/test-db/e2e-local.mjs -- scorer-smoke.spec.ts --project=mobile-chromium-auth
```

Playwright solo corre así: `playwright.config.ts` no tiene `baseURL` por defecto ni carga `.env.local`, y
`e2e/global-setup.ts` aborta si la app no es localhost o si `NEXT_PUBLIC_SUPABASE_URL` no es la base de pruebas (o un
Supabase local). Lo único que corre contra el deploy real es el smoke de páginas públicas, anónimo y sin global-setup:
`npm run test:e2e:smoke` (`playwright.monitoreo.config.ts`).

En Windows con OneDrive el build falla dentro de un worktree (Turbopack rechaza el `node_modules` enlazado): correrlo
desde el checkout principal.

| Workflow | Contra qué | Por qué |
|---|---|---|
| `scorer-smoke.yml` (cada PR, 4×/día y push a main) | app del commit + base de pruebas | 0 peticiones a prod; fuera de un PR avisa por Telegram |
| `ci.yml`, job `e2e-smoke` (push a main) | **prod**, a propósito | páginas públicas del deploy real, anónimo y sin escrituras |
| `e2e-auth-weekly.yml` (domingo) | app de main + base de pruebas | flujos que mutan: ya no dejan basura en prod |
| `qa-crawler.yml` (lunes, solo lectura) | app de main + base de pruebas | `e2e-local.mjs --comando -- node scripts/qa-crawler.mjs` |
| `e2e-trigger.yml` (manual desde /admin/e2e) | la URL que elija el admin | disparo manual, raro |

Lo vigila `scripts/ci/integracion-sin-prod.test.mjs`.
