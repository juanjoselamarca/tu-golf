-- Rollback de 20261123100000_scramble_equipos_de_club.sql: vuelve upsert_ronda_equipos_scores al cuerpo de
-- 20261020200000_orden_guardados_ronda_equipos (solo puede_anotar_ronda escribe), borra las RPC de reclamar/liberar,
-- los triggers del anotador (guarda y nombre), el índice y las tres columnas.
-- Antes de correrlo: el código que lee handicap_origen / anotador_* (PR2 a PR4 del scramble rápido) debe estar
-- revertido en prod, o sus INSERT y SELECT fallan con PGRST204. Se pierden los anotadores y la marca de equipos de
-- club (los equipos y sus scores quedan).

CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(p_equipo_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_scores jsonb;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, re.scores
    INTO v_ronda_id, v_estado, v_es_demo, v_scores
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

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_equipos_scores_orden AS o (equipo_id, dispositivo, seq)
    VALUES (p_equipo_id, p_dispositivo, p_seq)
    ON CONFLICT (equipo_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
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
$function$;

DROP FUNCTION IF EXISTS public.reclamar_equipo_de_ronda(text, uuid);
DROP FUNCTION IF EXISTS public.liberar_equipo_de_ronda(text, uuid);

DROP TRIGGER IF EXISTS ronda_equipos_anotador_guard ON public.ronda_equipos;
DROP FUNCTION IF EXISTS public.ronda_equipos_anotador_guard();
DROP TRIGGER IF EXISTS ronda_equipos_anotador_nombre ON public.ronda_equipos;
DROP FUNCTION IF EXISTS public.ronda_equipos_anotador_nombre();

DROP INDEX IF EXISTS public.ronda_equipos_un_equipo_por_anotador;

-- El DROP COLUMN se lleva sus constraints, la FK y el grant de columna a anon.
ALTER TABLE public.ronda_equipos
  DROP COLUMN IF EXISTS anotador_nombre,
  DROP COLUMN IF EXISTS anotador_user_id,
  DROP COLUMN IF EXISTS handicap_origen;
