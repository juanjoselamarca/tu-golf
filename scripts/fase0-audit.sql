-- FASE 0.4 — Auditoría schema Supabase pre-Cerebro v2

-- 4.1 Tablas relevantes existentes
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'taiger_%'
    OR table_name LIKE 'coach_%'
    OR table_name LIKE 'player_%'
    OR table_name = 'profiles'
  )
ORDER BY table_name;

-- 4.2 RLS habilitado en cada tabla
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'taiger_sessions',
  'taiger_recommendations',
  'player_patterns',
  'profiles'
)
ORDER BY relname;

-- 4.3 Conteo de filas (sanity)
SELECT 'taiger_sessions' AS tbl, COUNT(*) AS rows FROM taiger_sessions
UNION ALL SELECT 'taiger_recommendations', COUNT(*) FROM taiger_recommendations
UNION ALL SELECT 'player_patterns', COUNT(*) FROM player_patterns
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles;

-- 4.4 Conflicto de nombres con tablas a crear en FASE 1A
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('coach_plans', 'plan_outcomes', 'coach_events');
