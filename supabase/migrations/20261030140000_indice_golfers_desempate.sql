-- El índice Golfers+ elige siempre las mismas 20 rondas. Antes ordenaba solo por played_at (una fecha): con dos
-- rondas del mismo día en el corte, cuál entraba dependía del orden en que Postgres devolviera las filas. Ahora el
-- mismo día va primero la que se guardó después (created_at) y, si empatan, el id. Es el orden de `indexWindow`
-- (src/golf/core/index-window.ts), que exige canary-whs-index-sql.test.ts. Todo lo demás queda como en el baseline.
--
-- No recalcula a nadie: al 30-oct ningún usuario tiene dos rondas del mismo día en el corte (posiciones 20 y 21).
-- Los grants son los de hoy, repetidos (los exige canary-privado-por-defecto).
--
-- Rollback: supabase/migrations/rollback/20261030_indice_golfers_desempate_rollback.sql

CREATE OR REPLACE FUNCTION public.calcular_indice_golfers(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_differentials  DECIMAL[];
  v_count          INTEGER;
  v_best           INTEGER;
  v_adjustment     NUMERIC;
  v_average        NUMERIC;
  v_index          DECIMAL(4,1);
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user <> 'authenticator'
    OR (v_uid IS NOT NULL AND v_uid = p_user_id)
    OR (v_uid IS NOT NULL AND EXISTS (
      SELECT 1
      FROM ronda_libre_jugadores j
      JOIN rondas_libres r ON r.id = j.ronda_id
      WHERE j.user_id = p_user_id
        AND (
          r.creador_id = v_uid
          OR r.admin_user_id = v_uid
          OR EXISTS (SELECT 1 FROM ronda_libre_jugadores yo WHERE yo.ronda_id = r.id AND yo.user_id = v_uid)
        )
    ))
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: no puede recalcular el índice de otro jugador' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY_AGG(diferencial ORDER BY diferencial ASC)
  INTO   v_differentials
  FROM (
    SELECT diferencial
    FROM   historical_rounds
    WHERE  user_id               = p_user_id
      AND  diferencial           IS NOT NULL
      AND  slope_rating          IS NOT NULL
      AND  course_rating         IS NOT NULL
      AND  excluded_from_handicap = FALSE
      AND  (total_gross IS NULL OR holes_played IS NULL OR total_gross >= 3 * holes_played)
    ORDER  BY played_at DESC, created_at DESC NULLS LAST, id DESC
    LIMIT  20
  ) sub;

  v_count := COALESCE(ARRAY_LENGTH(v_differentials, 1), 0);

  IF v_count < 3 THEN
    UPDATE profiles
    SET    indice_golfers            = NULL,
           indice_golfers_updated_at = NOW()
    WHERE  id = p_user_id;
    RETURN NULL;
  END IF;

  v_best := CASE
    WHEN v_count <= 5  THEN 1
    WHEN v_count <= 8  THEN 2
    WHEN v_count <= 11 THEN 3
    WHEN v_count <= 14 THEN 4
    WHEN v_count <= 16 THEN 5
    WHEN v_count <= 18 THEN 6
    WHEN v_count = 19  THEN 7
    ELSE 8
  END;

  v_adjustment := CASE
    WHEN v_count = 3 THEN -2.0
    WHEN v_count = 4 THEN -1.0
    WHEN v_count = 6 THEN -1.0
    ELSE 0
  END;

  SELECT AVG(d)
  INTO   v_average
  FROM   UNNEST(v_differentials[1:v_best]) AS d;

  v_index := ROUND(v_average + v_adjustment, 1);

  UPDATE profiles
  SET    indice_golfers            = v_index,
         indice_golfers_updated_at = NOW()
  WHERE  id = p_user_id;

  RETURN v_index;
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_indice_golfers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_indice_golfers(uuid) TO authenticated, service_role;
