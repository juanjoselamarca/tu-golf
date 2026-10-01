-- calcular_indice_golfers corre como SECURITY DEFINER con autorización explícita (01-oct-2026).
--
-- Antes era SECURITY INVOKER:
--  * Cuando el anotador de grupo finalizaba por el jugador B, la función leía el
--    historial de B bajo RLS (sólo rondas públicas) y el UPDATE de B tocaba 0 filas:
--    el índice de B no se recalculaba, en silencio.
--  * Obligaba a dejar `indice_golfers*` escribible por el usuario (cualquiera podía
--    forjar su índice Golfers+ con un UPDATE directo).
--  * `EXCEPTION WHEN OTHERS ... RETURN NULL` tragaba todo error: entre las 05:26 y el
--    hotfix #470 el recálculo falló por permisos sin que nadie lo viera. Se elimina:
--    los llamadores ya revisan el error (useFinalizeRonda reintenta y lo reporta).
--
-- Quién puede recalcular el índice de p_user_id:
--  * el propio usuario;
--  * service role, o una conexión directa a la BD (sin JWT de PostgREST);
--  * quien creó o administra una ronda libre en la que p_user_id es jugador
--    (el anotador de grupo que finaliza por los demás).
-- El cálculo es determinista sobre el historial del propio jugador: no expone
-- más que el índice que ya se muestra en la app.

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
    OR current_setting('request.jwt.claims', true) IS NULL
    OR (v_uid IS NOT NULL AND v_uid = p_user_id)
    OR (v_uid IS NOT NULL AND EXISTS (
      SELECT 1
      FROM rondas_libres r
      JOIN ronda_libre_jugadores j ON j.ronda_id = r.id
      WHERE j.user_id = p_user_id
        AND (r.creador_id = v_uid OR r.admin_user_id = v_uid)
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
      AND  excluded_from_handicap = FALSE  -- inbox e21e2a32 parte B
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

-- Ya no hace falta que el usuario escriba su índice Golfers+: lo escribe la función.
REVOKE UPDATE (indice_golfers, indice_golfers_updated_at) ON public.profiles FROM authenticated;
