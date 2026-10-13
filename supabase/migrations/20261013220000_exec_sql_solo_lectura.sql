-- exec_sql pasa a solo lectura: la transacción queda read-only antes de ejecutar la consulta, así es Postgres el
-- que rechaza cualquier escritura o DDL, en cualquier nivel de anidación. Antes, todo lo que no empezaba con
-- select/with se ejecutaba tal cual como postgres.
--
-- Toda consulta se envuelve en un SELECT: se quitan el ; final (archivos .sql de run-sql.mjs) y el salto de línea
-- antes del ")" admite un comentario -- al final. El alias largo evita chocar con una columna `t` (respaldo diario).
--
-- El ACL va explícito: la migración que la creó (20260325000000) la dejó ejecutable por PUBLIC, y una base armada
-- desde migraciones expondría a anon una función que lee toda la base como postgres. En prod ya está así (no-op).
--
-- Rollback: supabase/migrations/rollback/20261013_exec_sql_solo_lectura_rollback.sql

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE result json;
BEGIN
  SET LOCAL transaction_read_only = on;
  BEGIN
    EXECUTE 'SELECT json_agg(row_to_json(exec_sql_fila)) FROM (' || regexp_replace(query, '[\s;]+$', '')
      || E'\n) exec_sql_fila' INTO result;
    RETURN COALESCE(result, '[]'::json);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
  END;
END; $fn$;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
