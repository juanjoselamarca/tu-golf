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
-- sin sesión hay que agregarla acá; lo vigila src/__tests__/prod/historical-rounds-anon-columnas.test.ts.
-- INSERT/UPDATE/DELETE de anon no cambian (own_rounds exige auth.uid()).
--
-- authenticated no cambia: el dueño lee sus notas con la sesión. Que otro usuario CON cuenta pueda leer
-- las notas de una ronda pública queda pendiente (pide sacar `notes` a una tabla sólo del dueño).
--
-- Rollback: supabase/migrations/rollback/20261025_historical_rounds_anon_sin_notas_rollback.sql

REVOKE SELECT ON TABLE public.historical_rounds FROM anon;

GRANT SELECT (
  id, user_id, privacy, course_name, course_id, total_gross, holes_played, played_at, tee_color,
  scores, par_per_hole, formato_juego, modo_juego
) ON TABLE public.historical_rounds TO anon;
