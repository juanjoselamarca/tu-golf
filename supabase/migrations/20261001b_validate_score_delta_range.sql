-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  SECURITY FIX: validar rango de scores en upsert_ronda_libre_*    ║
-- ║                                                                    ║
-- ║  El delta JSONB se acepta si es un objeto, pero no se valida que   ║
-- ║  las claves sean hoyos válidos (1-27) ni que los valores estén     ║
-- ║  en rango razonable (1-20). Un cliente malicioso puede enviar      ║
-- ║  {"1": 999, "2": -5} y corromper los scores.                      ║
-- ║                                                                    ║
-- ║  FIX: función helper que valida el delta y se usa en ambos RPCs.  ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Función helper: valida que cada entrada del delta sea hoyo 1-27, score 1-20.
-- Retorna sin error si el delta es válido; levanta excepción si no.
CREATE OR REPLACE FUNCTION public.validate_score_delta(p_delta jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  k text;
  v jsonb;
  hole_num int;
  score_val int;
BEGIN
  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN; -- no-op válido
  END IF;

  IF jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_delta)
  LOOP
    -- La clave debe ser un número entero (hoyo)
    BEGIN
      hole_num := k::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_DELTA: clave "%" no es un número de hoyo válido', k
        USING ERRCODE = 'P0004';
    END;

    IF hole_num < 1 OR hole_num > 27 THEN
      RAISE EXCEPTION 'INVALID_DELTA: hoyo % fuera de rango 1-27', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    -- El valor debe ser un número entero entre 1 y 20 (máximo pickup realista)
    IF jsonb_typeof(v) <> 'number' THEN
      RAISE EXCEPTION 'INVALID_DELTA: score del hoyo % no es un número', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    score_val := (v#>>'{}')::int;
    -- -1 = CONCEDE del match play (estado final, ver 20261001c).
    IF score_val <> -1 AND (score_val < 1 OR score_val > 20) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % fuera de rango 1-20', score_val, hole_num
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;
END;
$$;

-- Recrear upsert_ronda_libre_scores con validación de rango
CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(
  p_jugador_id uuid,
  p_codigo text,
  p_delta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  -- Validar estructura Y rango del delta (reemplaza el check simple anterior)
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
$$;

-- Recrear upsert_ronda_equipos_scores con validación de rango
CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(
  p_equipo_id uuid,
  p_codigo text,
  p_delta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  -- Validar estructura Y rango del delta
  PERFORM public.validate_score_delta(p_delta);

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo
    INTO v_ronda_id, v_estado, v_es_demo
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_equipos re ON re.ronda_id = rl.id
  WHERE re.id = p_equipo_id AND rl.codigo = p_codigo
  FOR UPDATE OF re;

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
    OR (auth.uid() IS NOT NULL AND public.puede_anotar_ronda(v_ronda_id))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.ronda_equipos
  SET scores = COALESCE(scores, '{}'::jsonb) || p_delta
  WHERE id = p_equipo_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$$;
