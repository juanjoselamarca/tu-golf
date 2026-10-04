-- Rollback de supabase/migrations/20261003a_privilegios_f1_sin_truncate_trigger_references.sql
-- Devuelve exactamente lo que había antes (default de Supabase). Tarda < 1 s.
-- Aplicar con: node --env-file=.env.local scripts/run-sql.mjs supabase/rollback/20261003a_privilegios_f1_rollback.sql

GRANT TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLES TO anon, authenticated;
