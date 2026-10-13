-- ROLLBACK de 20261013220000_exec_sql_solo_lectura.sql: vuelve la definición medida en prod el 13-oct, que ejecuta
-- como postgres todo lo que no empieza con select/with.
--
-- Vive en rollback/ para que la CLI de Supabase NUNCA lo tome como migración. run-sql.mjs ya no escribe:
-- se aplica copiándolo como migración nueva (PR → merge → workflow migraciones-prod).

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE result json; is_select boolean;
BEGIN
  is_select := lower(trim(query)) LIKE 'select%' OR lower(trim(query)) LIKE 'with%';
  IF is_select THEN
    EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
    RETURN COALESCE(result, '[]'::json);
  ELSE
    EXECUTE query;
    RETURN json_build_object('status', 'ok');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END; $fn$;
