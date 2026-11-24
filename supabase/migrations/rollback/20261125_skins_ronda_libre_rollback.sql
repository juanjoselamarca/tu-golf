-- Rollback de 20261125100000_skins_ronda_libre. Solo si la migraciÃ³n rompe algo.
-- ANTES: no debe quedar ninguna ronda 'skins' (el CHECK viejo no la acepta y el ALTER falla). Si hay, se deciden
-- a mano (cerrarlas o borrarlas) antes de correr esto. La columna fuera_del_hoyo se borra con sus datos.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.rondas_libres WHERE formato_juego = 'skins') THEN
    RAISE EXCEPTION 'Hay rondas de skins: resolverlas antes del rollback';
  END IF;
END $$;

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_formato_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text,
  'personalizado'::text]));

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_reglas_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_reglas_juego_check CHECK (
  (reglas_juego IS NULL OR jsonb_typeof(reglas_juego) = 'object')
  AND (formato_juego <> 'personalizado' OR reglas_juego IS NOT NULL)
);

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_puede_crear_timba());

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_puede_crear_timba());

ALTER TABLE public.ronda_libre_jugadores DROP COLUMN IF EXISTS fuera_del_hoyo;

-- Funciones: las versiones anteriores, copiadas de sus migraciones.
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
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_formato <> 'personalizado' OR v_reglas IS NULL THEN
    RAISE EXCEPTION 'RONDA_SIN_JUEGO' USING ERRCODE = '22023';
  END IF;
  -- Siempre con sesión (nada para anon). Al invitado sin cuenta (user_id NULL) lo marca solo quien anota la
  -- ronda (creador, marcador o un jugador de ella): antes bastaba tener el código.
  IF NOT (
    v_is_service
    -- IS NOT DISTINCT FROM y no `=`: con un invitado (user_id NULL) `=` da NULL, el IF NOT (NULL) no corta y el
    -- ajeno pasaría (lo cazó la prueba SQL).
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;

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
  v_formato text;
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
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego
    INTO v_ronda_id, v_estado, v_es_demo, v_formato
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
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
    -- Tarjeta de un invitado sin cuenta: cualquiera con el código la anota, salvo en la Timba (hay plata en juego y
    -- los ids de los jugadores salen en /juego/publico): ahí solo quien anota la ronda (rama de arriba). Decisión de
    -- Juanjo 18-nov; migración 20261121120000. IS DISTINCT FROM: formato_juego es NOT NULL, pero no se apuesta a eso.
    OR (v_user_id IS NULL AND v_formato IS DISTINCT FROM 'personalizado')
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
