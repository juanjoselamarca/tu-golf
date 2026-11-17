-- Timba libre: escrituras de la ronda contra el cierre, y marcas a invitados sin cuenta.
--
-- 1. Carrera del cierre (revisión Fable de #822). `upsert_ronda_libre_scores` y `timba_ronda_para_escribir` leían
--    `estado = 'en_curso'` sin bloquear la fila de la ronda: una escritura que leyó en curso justo antes del cierre
--    confirmaba después, y el resultado final (que se arma con la ronda ya cerrada) no la incluía. Ahora toman
--    FOR SHARE de la fila de `rondas_libres`: el cierre (FOR UPDATE en finalizar_ronda_libre, o el UPDATE directo
--    de force-close) espera a que confirmen, y las que llegan después ven la ronda cerrada (P0002). Orden: la ronda
--    antes que el jugador, como el cierre y los borrados de ronda (descartar_ronda_libre, CASCADE), para no cruzarse
--    en un deadlock (revisión Fable). Sin triggers en estas tablas que actualicen rondas_libres.
-- 2. Marcas a invitados (pendiente antes de abrir la Timba a todos): `timba_ronda_para_escribir` dejaba a
--    cualquier usuario con sesión y el código marcar puntos especiales o retiros a un jugador sin cuenta. Ahora
--    solo quien anota la ronda (`puede_anotar_ronda`). Los golpes (`upsert_ronda_libre_scores`) no cambian de
--    permiso en esta migración.
--
-- Definiciones de partida: las vigentes en prod al 17-nov-2026 (pg_get_functiondef). CREATE OR REPLACE conserva
-- los GRANT. Rollback: supabase/migrations/rollback/20261118_timba_lock_cierre_e_invitados_rollback.sql

CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(p_jugador_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
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
  v_scores jsonb;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  -- Primero la ronda (FOR SHARE), después el jugador (FOR UPDATE), en dos sentencias: el mismo orden que el cierre
  -- y los borrados de ronda (descartar_ronda_libre, DELETE con CASCADE), para que no se crucen en un deadlock.
  -- El cierre (finalizar_ronda_libre, FOR UPDATE; o un UPDATE directo) espera a que esta escritura confirme, y una
  -- que llega después ve el estado ya cerrado. Varias escrituras a la vez no se bloquean (SHARE con SHARE).
  SELECT rl.id, rl.estado, rl.es_demo
    INTO v_ronda_id, v_estado, v_es_demo
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT rlj.user_id, rlj.scores
      INTO v_user_id, v_scores
    FROM public.ronda_libre_jugadores rlj
    WHERE rlj.id = p_jugador_id AND rlj.ronda_id = v_ronda_id
    FOR UPDATE;
    IF NOT FOUND THEN
      v_ronda_id := NULL;
    END IF;
  END IF;

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

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_libre_scores_orden AS o (jugador_id, dispositivo, seq)
    VALUES (p_jugador_id, p_dispositivo, p_seq)
    ON CONFLICT (jugador_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
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

CREATE OR REPLACE FUNCTION public.timba_ronda_para_escribir(p_codigo text, p_jugador_id uuid)
 RETURNS TABLE(ronda_id uuid, reglas jsonb, holes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_formato text;
  v_reglas jsonb;
  v_holes integer;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego, rl.reglas_juego, rl.holes, rlj.user_id
    INTO v_ronda_id, v_estado, v_es_demo, v_formato, v_reglas, v_holes, v_user_id
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_libre_jugadores rlj ON rlj.ronda_id = rl.id
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo
  -- Mismo lock que upsert_ronda_libre_scores: lo toma la RPC que llama (misma transacción) hasta confirmar.
  FOR SHARE OF rl;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_formato <> 'personalizado' OR v_reglas IS NULL THEN
    RAISE EXCEPTION 'RONDA_SIN_JUEGO' USING ERRCODE = '22023';
  END IF;
  -- Siempre con sesión (nada para anon). Al invitado sin cuenta (user_id NULL) lo marca solo quien anota la
  -- ronda (creador, marcador o un jugador de ella): antes bastaba tener el código.
  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id = v_uid OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;

-- Privilegios (sin cambios respecto de prod; declarados por el canario privado-por-defecto).
REVOKE ALL ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) TO anon, authenticated, service_role;
-- Interna: solo la llaman marcar_puntito_ronda_libre y marcar_retiro_ronda_libre (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.timba_ronda_para_escribir(text, uuid) FROM PUBLIC, anon, authenticated;
