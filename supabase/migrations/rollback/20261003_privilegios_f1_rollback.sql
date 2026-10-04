-- ROLLBACK de 20261003_privilegios_f1_revoke_truncate_trigger_references.sql
-- Restaura EXACTAMENTE el estado de prod medido el 03-oct-2026 (sólo lectura):
--   * anon y authenticated: TRUNCATE, TRIGGER, REFERENCES, MAINTAIN en las 68 tablas
--     de public, sin grant option (information_schema.role_table_grants +
--     aclexplode(relacl): 68/68 por rol y privilegio, is_grantable = NO).
--   * pg_default_acl postgres/public/tablas:
--     {postgres=arwdDxtm,anon=arwdDxtm,authenticated=arwdDxtm,service_role=arwdDxtm}
--   * proacl de las 3 funciones de trigger:
--     {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
-- Aplicar: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261003_privilegios_f1_rollback.sql
-- Nota: si después de F1 se creó una tabla nueva, este GRANT también se la da
-- (ALL TABLES) — igual que el default ACL previo habría hecho.

BEGIN;

GRANT TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user()   TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_role_change()   TO PUBLIC, anon, authenticated;

COMMIT;
