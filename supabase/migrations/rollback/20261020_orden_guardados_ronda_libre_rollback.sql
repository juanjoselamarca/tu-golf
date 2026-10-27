-- Rollback de 20261020190000_orden_guardados_ronda_libre.sql: vuelve la función de 3 parámetros y se borra el orden
-- guardado por dispositivo.
-- Antes, revertir el cliente que manda p_seq y p_dispositivo: sin la función nueva sus guardados fallan.

DROP FUNCTION IF EXISTS public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid);

CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(p_jugador_id uuid, p_codigo text, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  SELECT rl.id, rl.estado, rl.es_demo, rlj.user_id
    INTO v_ronda_id, v_estado, v_es_demo, v_user_id
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_libre_jugadores rlj ON rlj.ronda_id = rl.id
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo
  FOR UPDATE OF rlj;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id = v_uid OR public.puede_anotar_ronda(v_ronda_id)))
    OR v_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.ronda_libre_jugadores
  SET scores = COALESCE(scores, '{}'::jsonb) || COALESCE(p_delta, '{}'::jsonb)
  WHERE id = p_jugador_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb) TO anon, authenticated, service_role;

DROP TABLE IF EXISTS public.ronda_libre_scores_orden;
