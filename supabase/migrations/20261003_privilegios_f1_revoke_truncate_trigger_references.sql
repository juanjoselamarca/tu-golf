-- Privilegios de tabla anon/authenticated — FASE F1 (riesgo cero). 03-oct-2026.
-- Plan: docs/superpowers/plans/2026-10-02-plan-9-fixes.md, ítem 7.
--
-- ESTADO DE PROD ANTES DE APLICAR (medido 03-oct con SELECT de sólo lectura):
--   * 68 tablas en public (relkind 'r', todas de postgres, todas con RLS).
--   * anon y authenticated tienen TRUNCATE, TRIGGER, REFERENCES y MAINTAIN (PG 17)
--     en las 68 (sin grant option). Ninguna la usa la app: PostgREST no expone esas
--     operaciones y ninguna función de public tiene TRUNCATE/LOCK/VACUUM/ANALYZE/
--     REINDEX/CLUSTER/REFRESH en el cuerpo.
--   * pg_default_acl de postgres en public (tablas) = arwdDxtm para anon y
--     authenticated → toda tabla nueva nace con el mismo hueco.
--   * handle_new_user, update_updated_at, log_role_change (public, sin argumentos,
--     RETURNS trigger, SECURITY DEFINER, dueño postgres) son ejecutables por PUBLIC,
--     anon y authenticated. Nadie las llama por RPC (grep `rpc(` en src y scripts).
--
-- QUÉ HACE
--   1. Revoca TRUNCATE, TRIGGER, REFERENCES, MAINTAIN de anon y authenticated en
--      todas las tablas de public. NO toca SELECT/INSERT/UPDATE/DELETE (fases F2/F3).
--      MAINTAIN se suma a lo del plan: misma clase (LOCK TABLE/VACUUM/ANALYZE/REINDEX
--      sobre la tabla), nadie la usa y viene en el mismo default ACL.
--   2. Lo mismo en los default privileges de postgres en public (tablas futuras).
--      Los de supabase_admin no se pueden alterar desde postgres (no es miembro de
--      supabase_admin); las tablas de public las crea postgres. El canario
--      privilegios-tablas.test.ts mira TODAS las tablas, así que una tabla creada
--      por otro rol con el hueco también lo pone rojo.
--   3. Revoca EXECUTE de PUBLIC, anon y authenticated en las 3 funciones de
--      trigger. Los triggers siguen disparando: PostgreSQL verifica EXECUTE al
--      CREAR el trigger, no al dispararlo. postgres (dueño) y service_role conservan
--      EXECUTE.
--
-- Idempotente (REVOKE de algo que no está es no-op). Rollback exacto en
-- supabase/migrations/rollback/20261003_privilegios_f1_rollback.sql.
-- Aplicar SÓLO después del merge (scripts/ceo-prompts/merge-rule.md).

BEGIN;

-- 1. Tablas existentes
REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- 2. Tablas futuras creadas por postgres en public
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon, authenticated;

-- 3. Funciones de trigger: nadie fuera de postgres/service_role las ejecuta directo
REVOKE EXECUTE ON FUNCTION public.handle_new_user()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_role_change()   FROM PUBLIC, anon, authenticated;

-- 4. Auto-chequeo: si queda algo (o se pasó de largo), aborta y la transacción no deja nada.
DO $$
DECLARE quedan_tablas int; quedan_fn int; sin_select int;
BEGIN
  SELECT count(*) INTO quedan_tablas
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rol)
  CROSS JOIN (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(priv)
  WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND has_table_privilege(r.rol, c.oid, p.priv);

  SELECT count(*) INTO quedan_fn
  FROM pg_proc f JOIN pg_namespace ns ON ns.oid = f.pronamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rol)
  WHERE ns.nspname = 'public' AND f.pronargs = 0
    AND f.proname IN ('handle_new_user', 'update_updated_at', 'log_role_change')
    AND has_function_privilege(r.rol, f.oid, 'EXECUTE');

  -- F1 no toca lectura: si authenticated perdió SELECT en alguna tabla, algo se pasó.
  SELECT count(*) INTO sin_select
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT has_table_privilege('authenticated', c.oid, 'SELECT');

  IF quedan_tablas > 0 OR quedan_fn > 0 OR sin_select > 0 THEN
    RAISE EXCEPTION 'Privilegios F1: quedan % privilegios de tabla y % EXECUTE de trigger; % tablas sin SELECT',
      quedan_tablas, quedan_fn, sin_select;
  END IF;
END $$;

COMMIT;
