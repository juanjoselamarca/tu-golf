-- Rollback de la migración indice_golfers_whs_5_2: vuelve a la fórmula anterior (la de 20261001000004) y recalcula.

CREATE OR REPLACE FUNCTION public.calcular_indice_golfers(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_diferenciales  DECIMAL[];
  v_count          INTEGER;
  v_usar           INTEGER;
  v_promedio       DECIMAL(5,2);
  v_indice         DECIMAL(4,1);
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
  INTO   v_diferenciales
  FROM (
    SELECT diferencial
    FROM   historical_rounds
    WHERE  user_id               = p_user_id
      AND  diferencial           IS NOT NULL
      AND  slope_rating          IS NOT NULL
      AND  course_rating         IS NOT NULL
      AND  excluded_from_handicap = FALSE
    ORDER  BY played_at DESC
    LIMIT  20
  ) sub;

  v_count := COALESCE(ARRAY_LENGTH(v_diferenciales, 1), 0);

  IF v_count < 3 THEN
    UPDATE profiles
    SET    indice_golfers            = NULL,
           indice_golfers_updated_at = NOW()
    WHERE  id = p_user_id;
    RETURN NULL;
  END IF;

  v_usar := CASE
    WHEN v_count <= 6  THEN 1
    WHEN v_count <= 8  THEN 2
    WHEN v_count <= 11 THEN 3
    WHEN v_count <= 14 THEN 4
    WHEN v_count <= 16 THEN 5
    WHEN v_count = 17  THEN 6
    WHEN v_count <= 19 THEN 7
    ELSE 8
  END;

  SELECT AVG(d)
  INTO   v_promedio
  FROM   UNNEST(v_diferenciales[1:v_usar]) AS d;

  v_indice := ROUND(v_promedio * 0.96, 1);

  UPDATE profiles
  SET    indice_golfers            = v_indice,
         indice_golfers_updated_at = NOW()
  WHERE  id = p_user_id;

  RETURN v_indice;
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_indice_golfers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_indice_golfers(uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.profiles.indice_golfers IS
  'Índice calculado por Golfers+. Fórmula USGA: mejores N diferenciales de las últimas 20 rondas × 0.96. Mínimo 3 rondas con slope/rating para activarse.';

DO $recalculo_indice$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN
    SELECT id FROM public.profiles WHERE indice_golfers IS NOT NULL
    UNION
    SELECT user_id FROM public.historical_rounds
    WHERE diferencial IS NOT NULL AND slope_rating IS NOT NULL AND course_rating IS NOT NULL AND excluded_from_handicap = FALSE
  LOOP
    PERFORM public.calcular_indice_golfers(v_user);
  END LOOP;
END $recalculo_indice$;
