-- Rollback de 20261123200000_equipo_tomado_lo_escribe_su_anotador.sql: borra el trigger
-- ronda_equipos_scores_de_su_anotador y vuelve upsert_ronda_equipos_scores al cuerpo de
-- 20261123100000_scramble_equipos_de_club (el creador y quien pasa puede_anotar_ronda escriben cualquier equipo,
-- también uno que anota otro celular). El código de la app no depende de esta regla: no intenta escribir equipos
-- ajenos.

DROP TRIGGER IF EXISTS ronda_equipos_scores_de_su_anotador ON public.ronda_equipos;
DROP FUNCTION IF EXISTS public.ronda_equipos_scores_de_su_anotador();

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
  v_anotador uuid;
  v_origen text;
  v_admin_mode boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, re.scores, re.anotador_user_id, re.handicap_origen
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_scores, v_anotador, v_origen
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

  -- El anotador de un equipo (un celular por equipo) escribe SOLO ese equipo: v_anotador es el de esta fila, leído
  -- bajo su lock. puede_anotar_ronda (creador, marcador, jugadores) sigue escribiendo cualquiera, como antes.
  -- IS NOT DISTINCT FROM y no `=`: con el equipo sin anotador, `NULL = uid` es NULL y NOT (false OR NULL) también,
  -- y el IF no cortaría. La rama del anotador vale solo en un equipo de club de una ronda de un celular por equipo
  -- (admin_mode no TRUE). Rondas de torneo y demo no llegan acá con anotador: reclamar_equipo_de_ronda las rechaza
  -- y ronda_equipos_anotador_guard impide asignarlo desde el cliente (la demo, además, corta arriba).
  IF NOT (
    v_is_service
    OR (auth.uid() IS NOT NULL AND (
      public.puede_anotar_ronda(v_ronda_id)
      OR (v_origen = 'club' AND v_admin_mode IS NOT TRUE AND v_anotador IS NOT DISTINCT FROM auth.uid())
    ))
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

-- CREATE OR REPLACE conserva los grants; se repiten para que la migración deje explícito quién la ejecuta.
REVOKE ALL ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) TO authenticated;
