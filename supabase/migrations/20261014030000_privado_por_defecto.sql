-- Privado por defecto: las tablas, vistas, secuencias y funciones que cree postgres desde ahora nacen sin permisos
-- para anon ni authenticated. Cada migración otorga lo que la app necesita (GRANT) o declara el objeto privado
-- (REVOKE), y lo exige src/__tests__/canary-privado-por-defecto.test.ts. Olvidarlo rompe la feature al probarla
-- (42501) en vez de exponer datos, como pasó con las tablas del coach y search_chunks_hybrid.
--
-- Prod el 13-oct (pg_default_acl): postgres en public daba arwd en tablas, rwU en secuencias y EXECUTE en funciones a
-- anon y authenticated. Además PUBLIC recibe EXECUTE en toda función nueva por el default global de Postgres, y un
-- REVOKE por esquema no descuenta un default global (probado en Postgres 17): por eso el de PUBLIC va sin IN SCHEMA.
--
-- Lo que ya existe no cambia. service_role conserva todo. Los defaults de supabase_admin en public (objetos de
-- extensiones) no se pueden alterar desde postgres. Una columna serial necesita GRANT USAGE en su secuencia para que
-- la sesión inserte; identity y uuid no.
--
-- Rollback: supabase/migrations/rollback/20261014_privado_por_defecto_rollback.sql

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Auto-chequeo con objetos nuevos de prueba: si algo queda abierto, la migración aborta y no se registra.
DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Privado por defecto: debe correr como postgres (current_user=%)', current_user;
  END IF;

  CREATE TABLE public.__privado_sonda (id bigint GENERATED ALWAYS AS IDENTITY, n serial);
  CREATE VIEW public.__privado_sonda_vista AS SELECT id FROM public.__privado_sonda;
  CREATE FUNCTION public.__privado_sonda_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

  IF has_table_privilege('anon', 'public.__privado_sonda', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('authenticated', 'public.__privado_sonda', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('anon', 'public.__privado_sonda_vista', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.__privado_sonda_vista', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_sequence_privilege('anon', 'public.__privado_sonda_n_seq', 'USAGE,SELECT,UPDATE')
    OR has_sequence_privilege('authenticated', 'public.__privado_sonda_n_seq', 'USAGE,SELECT,UPDATE')
    OR has_function_privilege('anon', 'public.__privado_sonda_fn()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.__privado_sonda_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privado por defecto: un objeto nuevo sigue naciendo con permisos para anon o authenticated';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.__privado_sonda', 'SELECT')
    OR NOT has_function_privilege('service_role', 'public.__privado_sonda_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privado por defecto: service_role perdió permisos sobre los objetos nuevos';
  END IF;

  DROP FUNCTION public.__privado_sonda_fn();
  DROP VIEW public.__privado_sonda_vista;
  DROP TABLE public.__privado_sonda;
END $$;
