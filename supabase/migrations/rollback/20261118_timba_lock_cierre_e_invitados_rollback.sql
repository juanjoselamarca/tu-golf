-- Rollback de 20261118120000_timba_lock_cierre_e_invitados.sql: las dos funciones vuelven a su definición previa
-- (sin FOR SHARE de la ronda; cualquiera con sesión y el código vuelve a marcar a un invitado sin cuenta;
-- eliminar_cuenta vuelve a desvincular al marcador designado al final).

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
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo;

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
  -- Mismo criterio que upsert_ronda_libre_scores, pero siempre con sesión (nada para anon).
  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id = v_uid OR v_user_id IS NULL OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_cuenta(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueos text[] := ARRAY[]::text[];
  c_anonimo  CONSTANT text := 'Jugador eliminado';
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator') THEN
    RAISE EXCEPTION 'FORBIDDEN: eliminar_cuenta solo corre con service role' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'eliminar_cuenta: p_user_id es obligatorio' USING ERRCODE = '22004';
  END IF;

  -- Idempotente: un reintento tras un éxito no es un error.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
  END IF;

  -- Candado antes de mirar: quien se inscriba en su torneo o se una a su ronda mientras tanto toma
  -- FOR KEY SHARE sobre la misma fila y espera; al seguir, los EXISTS de abajo ya lo ven.
  PERFORM 1 FROM tournaments WHERE organizer_id = p_user_id FOR UPDATE;
  PERFORM 1 FROM rondas_libres WHERE creador_id = p_user_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM tournaments t
    WHERE t.organizer_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM players pl
        WHERE pl.tournament_id = t.id
          AND pl.user_id IS DISTINCT FROM p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'organiza_torneos_con_otros';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rondas_libres r
    WHERE r.creador_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM ronda_libre_jugadores j
        WHERE j.ronda_id = r.id
          AND j.user_id IS NOT NULL
          AND j.user_id <> p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'creo_rondas_con_otros';
  END IF;

  IF array_length(v_bloqueos, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'bloqueos', to_jsonb(v_bloqueos));
  END IF;

  -- Sus sesiones del coach apuntan a sus rondas y torneos (NO ACTION).
  DELETE FROM taiger_sessions WHERE user_id = p_user_id;

  -- Sus torneos: sin otros jugadores (verificado arriba). Arrastra grupos, players, rounds y hole_scores.
  DELETE FROM tournaments WHERE organizer_id = p_user_id;

  -- Su tarjeta en rondas ajenas: se desvincula y se anonimiza, no se borra (best ball, match play y el
  -- grupo de un torneo ajeno dependen de esa fila).
  UPDATE ronda_libre_jugadores j
  SET    user_id = NULL, pending_user_id = NULL, nombre = c_anonimo,
         nombre_invitado = NULL, telefono_invitado = NULL
  WHERE  j.user_id = p_user_id
    AND  NOT EXISTS (SELECT 1 FROM rondas_libres r WHERE r.id = j.ronda_id AND r.creador_id = p_user_id);

  -- Su inscripción en torneos ajenos: igual (sus rounds/hole_scores sostienen el leaderboard y los
  -- premios). players exige user_id XOR pending_user_id (CHECK): queda como invitado con un id nuevo
  -- que nadie conoce, así que nadie puede reclamar esa tarjeta.
  UPDATE players
  SET    user_id = NULL, pending_user_id = gen_random_uuid(), player_name = c_anonimo
  WHERE  user_id = p_user_id OR pending_user_id = p_user_id;

  -- Reclamos pendientes a su nombre en rondas libres (sin FK): que no apunten a una cuenta que ya no existe.
  UPDATE ronda_libre_jugadores SET pending_user_id = NULL WHERE pending_user_id = p_user_id;

  -- Tarjetas en que un creador lo eligió como rival (perfil_sugerido_id): cambia SOLO `nombre` (copiado
  -- del perfil al elegirlo en el buscador) por c_anonimo, y SOLO en filas sin cuenta vinculada (user_id y
  -- pending_user_id NULL; los reclamos a su nombre se limpiaron en el UPDATE anterior). No toca
  -- nombre_invitado, telefono_invitado, puntajes ni perfil_sugerido_id: ese lo deja en NULL el
  -- ON DELETE SET NULL cuando se borra el perfil, más abajo.
  UPDATE ronda_libre_jugadores SET nombre = c_anonimo
  WHERE  perfil_sugerido_id = p_user_id AND user_id IS NULL AND pending_user_id IS NULL;

  -- Rondas ajenas que él administraba (rondas_libres.admin_user_id → auth.users es NO ACTION).
  UPDATE rondas_libres
  SET    admin_user_id = NULL, admin_mode = false
  WHERE  admin_user_id = p_user_id
    AND  creador_id IS DISTINCT FROM p_user_id;

  -- Las rondas libres que creó: sin otros usuarios (verificado arriba). Arrastra sus filas y las de
  -- sus invitados (ronda_libre_jugadores.user_id → profiles es NO ACTION).
  DELETE FROM rondas_libres WHERE creador_id = p_user_id;

  -- Arrastra profiles y todo lo que cuelga de profiles o de auth.users (CASCADE / SET NULL).
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
END;
$function$;
