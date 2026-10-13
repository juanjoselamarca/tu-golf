ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS analysis_level TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS golf_goals TEXT;

CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $fn$
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
