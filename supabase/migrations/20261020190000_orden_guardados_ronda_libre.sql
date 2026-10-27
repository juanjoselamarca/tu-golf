-- Un guardado viejo de la tarjeta de un jugador que llega tarde ya no pisa los golpes de uno más nuevo del mismo
-- dispositivo.
--
-- El scorer reintenta cada guardado y le da 12 s de plazo (PLAZO_GUARDADO_MS); el servidor puede aplicarlo igual
-- después, cuando ya entró uno más nuevo, y como manda la tarjeta entera (`scores || delta`) devuelve esos hoyos a
-- lo que decían antes. Ahora el cliente puede mandar su dispositivo y una secuencia que sube en cada guardado: si
-- ese dispositivo ya guardó una secuencia igual o mayor, el guardado no cambia nada y responde los golpes actuales.
-- Sin los dos parámetros todo sigue como antes (el cliente actual, score-grupo y el admin).
--
-- La secuencia vive en una tabla privada y no en ronda_libre_jugadores, que la lee cualquiera: con el dispositivo
-- a la vista, otro podría mandar una secuencia enorme y congelar los guardados de ese dispositivo.
-- DROP y no sólo CREATE OR REPLACE: con las dos firmas PostgREST no sabe a cuál llamar con 3 parámetros.
--
-- Rollback: supabase/migrations/rollback/20261020_orden_guardados_ronda_libre_rollback.sql

CREATE TABLE IF NOT EXISTS public.ronda_libre_scores_orden (
  jugador_id uuid NOT NULL REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE,
  dispositivo uuid NOT NULL,
  seq bigint NOT NULL,
  PRIMARY KEY (jugador_id, dispositivo)
);

ALTER TABLE public.ronda_libre_scores_orden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ronda_libre_scores_orden FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.upsert_ronda_libre_scores(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(
  p_jugador_id uuid,
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
  v_user_id uuid;
  v_scores jsonb;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  SELECT rl.id, rl.estado, rl.es_demo, rlj.user_id, rlj.scores
    INTO v_ronda_id, v_estado, v_es_demo, v_user_id, v_scores
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

REVOKE ALL ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) TO anon, authenticated, service_role;
