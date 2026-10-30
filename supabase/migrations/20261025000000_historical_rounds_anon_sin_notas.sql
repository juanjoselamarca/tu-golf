-- Las notas privadas de una ronda compartida dejan de leerse sin cuenta.
--
-- Compartir la tarjeta deja la ronda en privacy='public' (src/lib/data/rounds.ts) y la policy
-- public_rounds la abre a cualquiera. RLS filtra filas, no columnas: la app no pide `notes` para un
-- tercero (COLUMNAS_PUBLICAS en src/lib/data/tarjeta-guardada.ts), pero la anon key va en el bundle y
-- `GET /rest/v1/historical_rounds?select=notes&privacy=eq.public` devolvía las notas de todas las rondas
-- compartidas (verificado contra prod el 25-oct-2026).
--
-- anon queda con SELECT sólo sobre lo que leen sus dos únicos caminos (la tarjeta pública y su preview
-- de WhatsApp: tarjeta-guardada.ts y tarjeta-og.ts), más `privacy`, que filtra su policy. Mismo patrón que
-- profiles (baseline: GRANT SELECT por columna). Una columna nueva que la tarjeta pública necesite leer
-- sin sesión NO se agrega acá: al mergear esta migración queda inmutable (scripts/ci/migraciones-inmutables.mjs).
--
-- Esta migración supersede el header de 20261029120000_anon_sin_permisos_de_tabla.sql, que dice que anon
-- conserva el SELECT de tabla sobre historical_rounds: esa migración es inmutable y no se edita.
-- Va en una migración NUEVA, más la lista canónica ANON_COLUMNS (src/__tests__/helpers/migration-sql.ts), que es
-- lo que comparan canary-anon-columns (contra supabase/schema.sql) y canary-historical-rounds-anon-grant (contra
-- lo que leen tarjeta-guardada.ts y tarjeta-og.ts). En la base lo vigila
-- src/__tests__/prod/historical-rounds-anon-columnas.test.ts.
-- INSERT/UPDATE/DELETE de anon no cambian (own_rounds exige auth.uid()).
--
-- `privacy` va en el GRANT para poder filtrar (`?privacy=eq.public`, y lo usa el test de prod), no porque
-- la tarjeta lo pinte.
--
-- authenticated no cambia: el dueño lee sus notas con la sesión. Que otro usuario CON cuenta pueda leer
-- las notas de una ronda pública queda PENDIENTE y anotado en docs/REORDENAMIENTO_TRACKING.md (no se
-- arregla con GRANT: los privilegios de columna no son por fila, pide sacar `notes` a una tabla sólo del
-- dueño o leerlas por un RPC security definer).
--
-- Rollback: supabase/migrations/rollback/20261025_historical_rounds_anon_sin_notas_rollback.sql

REVOKE SELECT ON TABLE public.historical_rounds FROM anon;

GRANT SELECT (
  id, user_id, privacy, course_name, course_id, total_gross, holes_played, played_at, tee_color,
  scores, par_per_hole, formato_juego, modo_juego
) ON TABLE public.historical_rounds TO anon;
