# Base local para `npm run dev`

> Desde el 04-nov-2026 `next dev` no arranca si alguna variable de Supabase apunta a prod (`next.config.js`,
> predicado `prodSupabaseVars` en `scripts/lib/supabase-ref.mjs`). En localhost se usa un Supabase local en Docker.

## Primera vez

1. Docker Desktop corriendo y el CLI de Supabase instalado (`brew install supabase/tap/supabase`; en Windows,
   `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` y `scoop install supabase`).
2. `npm run db:local`: levanta el Supabase local con todas las migraciones de `supabase/migrations`, escribe
   `.env.development.local` (gitignoreado) y siembra canchas y fixtures con `scripts/test-db/seed.mjs`.
3. `npm run dev`.

Next lee `.env.development.local` antes que `.env.local` solo en `next dev`; `next build` y los scripts con
`--env-file=.env.local` no lo leen.

La guarda corre al arrancar `next dev`. Si editas un `.env*` con el servidor andando, Next recarga el entorno sin
volver a chequear: después de tocarlos, reinicia `npm run dev`.

## Qué queda en la base local

- Las mismas tablas que prod (migraciones) y los datos de `scripts/test-db/seed-data/`. Ningún dato de usuarios reales.
- Usuario de prueba `e2e-test@golfersplus-test.local`; su contraseña está en `.env.development.local`
  (`TEST_E2E_USER_PASSWORD`). Las cuentas locales deben ser `@golfersplus-test.local`: con otra, el seed aborta.
- Corren 4 contenedores: Postgres, auth, PostgREST y el gateway (`db:local` excluye el resto). Sin storage, subir la
  portada de un torneo falla en local; sin buzón de correos, recuperar contraseña responde error 500 (el registro no
  lo necesita: la cuenta entra sin confirmar el correo).
- Sin pg_cron ni pg_net (no están en las migraciones).

## Día a día

- `supabase stop` la apaga y conserva los datos; `npm run db:local` la vuelve a levantar.
- Rama con migraciones nuevas: `supabase migration up`. Para partir de cero: `supabase db reset` y `npm run db:local`.
- Todos los worktrees comparten la misma base local (`project_id = "tu-golf"`). `setup-worktree.mjs` copia
  `.env.development.local` al worktree nuevo.
- El resto de los servicios de `.env.local` (PostHog, Telegram, correo, pagos) siguen siendo los reales.
