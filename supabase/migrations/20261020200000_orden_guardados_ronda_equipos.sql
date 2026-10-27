-- Lo mismo que 20261020190000_orden_guardados_ronda_libre.sql para el score compartido de scramble y foursome: un
-- guardado viejo de la tarjeta de un equipo que llega tarde ya no pisa los golpes de uno más nuevo del mismo
-- dispositivo. Sin p_seq y p_dispositivo todo sigue como antes.
--
-- Rollback: supabase/migrations/rollback/20261020_orden_guardados_ronda_equipos_rollback.sql

CREATE TABLE IF NOT EXISTS public.ronda_equipos_scores_orden (
  equipo_id uuid NOT NULL REFERENCES public.ronda_equipos(id) ON DELETE CASCADE,
  dispositivo uuid NOT NULL,
  seq bigint NOT NULL,
  PRIMARY KEY (equipo_id, dispositivo)
);

ALTER TABLE public.ronda_equipos_scores_orden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ronda_equipos_scores_orden FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.upsert_ronda_equipos_scores(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(
  p_equipo_id uuid,
  p_codigo text,
  p_delta jsonb,
  p_seq bigint DEFAULT NULL,
  p_dispositivo uuid DEFAULT NULL
)
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

REVOKE ALL ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) TO authenticated, service_role;
