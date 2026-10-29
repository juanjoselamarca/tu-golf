-- Privado por defecto, capa 3 (docs/PLAN-MAX.md, item 4): anon queda solo con los permisos de tabla que usa el
-- código que corre sin sesión. SOLO permisos de anon; authenticated y service_role no cambian.
--
-- Lo que anon conserva:
--   SELECT de tabla: categories, course_holes, course_tees, courses, tournaments, tournament_rounds (rondas 2..N
--     de /torneo/[slug], en vivo y TV) e historical_rounds (tarjeta pública, policy public_rounds).
--   SELECT por columna, sin cambios: las 9 tablas de 20261027120000 y profiles (embeds del leaderboard y la TV).
--   INSERT en analytics_events y error_logs (src/lib/analytics.ts y src/lib/error-tracking.ts, sin .select()).
-- Lo demás se revoca: INSERT, UPDATE y DELETE en las tablas que lee; SELECT, UPDATE y DELETE en las dos de log;
-- y todo en el resto de public, incluidas las que tienen policy de lectura pública pero ninguna página sin sesión
-- lee (cerebro_weights, external_priors_*, flights, golf_rules, tournament_templates).
--
-- Auditoría del 29-oct: el código que corre sin sesión (createAnonClient, páginas y rutas fuera de src/proxy.ts,
-- cliente del navegador en páginas públicas) y 7 días de logs de PostgREST con la anon key sin JWT: solo GET a
-- tablas de esta lista (más los sondeos del canario coach-tables-privileges, que aceptan 42501) y POST a
-- analytics_events. Ningún PATCH ni DELETE.
--
-- RLS ya le negaba a anon toda escritura salvo esos INSERT. Lo que cambia es la respuesta: un UPDATE o DELETE
-- de anon da 42501 en vez de 0 filas, y un SELECT a una tabla revocada falla en vez de volver vacío.
-- Las policies de las tablas que anon lee se evalúan con su rol; las que tienen subconsultas solo leen tablas
-- y columnas que anon conserva (profiles.id y role, tournaments, rondas_libres.id y creador_id, ronda_equipos,
-- tournament_groups). La RPC SECURITY INVOKER restamp_round_metrics_target, que anon ejecuta, deja de poder
-- escribir round_metrics.
--
-- Una tabla nueva ya nace sin permisos para anon (default ACL, 20261014030000). Si una página sin sesión empieza
-- a leer una tabla, su migración agrega el GRANT ... TO anon y la entrada en ANON_TABLE_PRIVILEGES
-- (src/__tests__/helpers/migration-sql.ts), que lo exige en el repo y en prod.
--
-- Las tablas con SELECT por columna quedan fuera del REVOKE ALL: un REVOKE de tabla también borra esos grants.
-- Idempotente.
--
-- Rollback: supabase/migrations/rollback/20261029_anon_sin_permisos_de_tabla_rollback.sql

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND c.relname NOT IN (
        'categories', 'course_holes', 'course_tees', 'courses', 'historical_rounds', 'tournament_rounds', 'tournaments',
        'hole_scores', 'players', 'rounds', 'tournament_groups', 'tournament_group_players', 'rondas_libres',
        'ronda_libre_jugadores', 'ronda_equipos', 'ronda_equipo_jugadores', 'profiles',
        'analytics_events', 'error_logs'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON
  public.categories, public.course_holes, public.course_tees, public.courses, public.historical_rounds,
  public.tournament_rounds, public.tournaments,
  public.hole_scores, public.players, public.rounds, public.tournament_groups, public.tournament_group_players,
  public.rondas_libres, public.ronda_libre_jugadores, public.ronda_equipos, public.ronda_equipo_jugadores,
  public.profiles
  FROM anon;

REVOKE SELECT, UPDATE, DELETE ON public.analytics_events, public.error_logs FROM anon;
