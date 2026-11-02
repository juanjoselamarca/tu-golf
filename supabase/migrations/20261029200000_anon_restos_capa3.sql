-- Privado por defecto, restos de la capa 3 (20261029120000): los permisos que anon conservaba sin usarlos.
-- Solo permisos de anon, salvo restamp_round_metrics_target, que tampoco ejecuta authenticated. service_role no
-- cambia.
--
-- 1. restamp_round_metrics_target (SECURITY INVOKER): anon la ejecutaba por grant propio y por PUBLIC, y
--    authenticated por grant propio. Solo la llama el coach con service role (src/golf/coach/v3/tools/focus-tools.ts).
-- 2. Secuencias: anon tenía USAGE, SELECT y UPDATE en las de cerebro_events, coach_events, cost_tracking,
--    pattern_observations y external_priors_*, tablas en las que no inserta desde la capa 3.
-- 3. profiles: ninguna policy le muestra filas a anon, pero PostgREST exige el permiso de columna de lo que pide
--    aunque RLS devuelva 0 filas. anon queda con las 6 columnas que pide el código sin sesión: /ranking (id, name,
--    indice, indice_golfers, nivel, avatar_url), /api/health (id) y los embeds players -> profiles de torneo
--    (id, name, indice). Pierde role, subscription_*, trial_*, coach_access_enabled y el resto. Logs de PostgREST
--    con la anon key sin JWT, 7 días al 29-oct: solo las consultas de /ranking y /api/health.
--    "Solo admin gestiona hoyos" (course_holes) y "course_tees_write_admin" (course_tees) son FOR ALL TO public y
--    leen profiles.role, pero anon sigue leyendo esas tablas: su policy de lectura es USING (true), Postgres pliega
--    el OR de las policies a true y no planifica la subconsulta. Sin ese USING (true) daría 42501; la prueba SQL
--    anon-permisos-tabla lee las dos tablas como anon.
--
-- Las columnas de profiles que anon lee viven en ANON_COLUMN_SELECT (src/__tests__/helpers/migration-sql.ts),
-- que exigen canary-anon-columns en el repo y prod/rls-public-read en prod. Idempotente.
--
-- Rollback: supabase/migrations/rollback/20261029_anon_restos_capa3_rollback.sql

REVOKE EXECUTE ON FUNCTION public.restamp_round_metrics_target(uuid, numeric) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Un REVOKE de SELECT a nivel de tabla también borra los grants por columna.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (avatar_url, id, indice, indice_golfers, name, nivel) ON public.profiles TO anon;
