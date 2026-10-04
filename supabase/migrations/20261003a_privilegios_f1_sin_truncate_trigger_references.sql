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

-- La migración falla (y no deja nada a medias) si el resultado no es el esperado.
-- Se verifica con has_table_privilege (el runtime), no con information_schema, que solo
-- lista grants visibles para el rol que ejecuta (hallazgo de la revisión de Fable).
DO $$
DECLARE quedan int;
BEGIN
  -- 1) Ninguna relación de public le deja estos privilegios a anon/authenticated.
  SELECT count(*) INTO quedan
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(rol)
  CROSS JOIN unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']) AS p(priv)
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND has_table_privilege(r.rol, c.oid, p.priv);
  IF quedan > 0 THEN
    RAISE EXCEPTION 'Privilegios F1: quedan % privilegios TRUNCATE/TRIGGER/REFERENCES para anon/authenticated', quedan;
  END IF;

  -- 2) Una tabla NUEVA (como la que crearía una migración futura) nace sin ellos.
  --    Los defaults por esquema no pueden quitar un default global: esto lo prueba.
  CREATE TABLE public.__privilegios_f1_sonda (id int);
  IF has_table_privilege('anon', 'public.__privilegios_f1_sonda', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.__privilegios_f1_sonda', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.__privilegios_f1_sonda', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.__privilegios_f1_sonda', 'TRIGGER')
     OR has_table_privilege('anon', 'public.__privilegios_f1_sonda', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.__privilegios_f1_sonda', 'REFERENCES') THEN
    RAISE EXCEPTION 'Privilegios F1: los default privileges siguen concediendo estos privilegios a tablas nuevas';
  END IF;
  DROP TABLE public.__privilegios_f1_sonda;
END $$;
