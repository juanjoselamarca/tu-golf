-- Privilegios F1 (ítem 7 del plan docs/superpowers/plans/2026-10-02-plan-9-fixes.md).
--
-- Hoy anon y authenticated tienen TRUNCATE, TRIGGER y REFERENCES en las 68 tablas de
-- public (default de Supabase). La app no usa ninguno: PostgREST no expone TRUNCATE ni
-- TRIGGER/REFERENCES, y ningún RPC los necesita. Son la última barrera si una policy RLS
-- futura queda mal escrita (TRUNCATE ni siquiera pasa por RLS). Riesgo cero para la app.
--
-- Verificado antes de escribir esto (02/03-oct, en una transacción que se revierte sola):
-- con este REVOKE aplicado, un usuario autenticado sigue actualizando su perfil y el
-- trigger update_updated_at sigue disparando.
--
-- Fuera de alcance a propósito:
--  - EXECUTE de las funciones de trigger (handle_new_user, update_updated_at,
--    log_role_change): PostgREST no puede invocarlas (devuelven `trigger`), así que
--    revocarlas no cierra nada, y handle_new_user corre en cada registro como
--    supabase_auth_admin, rol que no se puede suplantar para probarlo. No se toca.
--  - Defaults de objetos creados por supabase_admin: postgres no puede alterarlos.
--    Las tablas de la app las crean las migraciones, que corren como postgres.
--  - INSERT/UPDATE/DELETE de anon y authenticated: fases F2 y F3, con Juanjo presente.
--
-- Rollback: supabase/rollback/20261003a_privilegios_f1_rollback.sql (GRANT inverso).

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tablas futuras creadas por postgres (las migraciones) nacen sin estos privilegios.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- La migración falla (y no deja nada a medias) si quedó algún privilegio de estos.
DO $$
DECLARE quedan int;
BEGIN
  SELECT count(*) INTO quedan
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF quedan > 0 THEN
    RAISE EXCEPTION 'Privilegios F1: quedan % privilegios TRUNCATE/TRIGGER/REFERENCES para anon/authenticated', quedan;
  END IF;
END $$;
