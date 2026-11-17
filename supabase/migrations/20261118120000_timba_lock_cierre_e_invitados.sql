-- Timba libre: escrituras de la ronda contra el cierre, y marcas a invitados sin cuenta.
--
-- 1. Carrera del cierre (revisión Fable de #822). `upsert_ronda_libre_scores` y `timba_ronda_para_escribir` leían
--    `estado = 'en_curso'` sin bloquear la fila de la ronda: una escritura que leyó en curso justo antes del cierre
--    confirmaba después, y el resultado final (que se arma con la ronda ya cerrada) no la incluía. Ahora toman
--    FOR SHARE de la fila de `rondas_libres`: el cierre (FOR UPDATE en finalizar_ronda_libre, o el UPDATE directo
--    de force-close) espera a que confirmen, y las que llegan después ven la ronda cerrada (P0002). Orden: la ronda
--    antes que el jugador, como el cierre y los borrados de ronda (descartar_ronda_libre, CASCADE), para no cruzarse
--    en un deadlock (revisión Fable; ver 3). Sin triggers en estas tablas que actualicen rondas_libres.
-- 2. Marcas a invitados (pendiente antes de abrir la Timba a todos): `timba_ronda_para_escribir` dejaba a
--    cualquier usuario con sesión y el código marcar puntos especiales o retiros a un jugador sin cuenta. Ahora
--    solo quien anota la ronda (`puede_anotar_ronda`). Los golpes (`upsert_ronda_libre_scores`) no cambian de
--    permiso en esta migración.
-- 3. eliminar_cuenta desvincula al marcador designado (UPDATE rondas_libres) ANTES de tocar sus tarjetas en rondas
--    ajenas: con el orden de antes (jugador → ronda) se cruzaba en un deadlock con el upsert nuevo (ronda → jugador)
--    si la cuenta se borraba mientras alguien guardaba golpes en esa ronda (revisión Fable, 2ª vuelta).
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
    -- IS NOT DISTINCT FROM y no `=`: con un invitado (user_id NULL) `=` da NULL, el IF NOT (NULL) no corta y el
    -- ajeno pasaría (lo cazó la prueba SQL).
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
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

  -- Rondas ajenas que él administraba (rondas_libres.admin_user_id → auth.users es NO ACTION). Va ANTES de tocar
  -- tarjetas: la ronda antes que el jugador, el mismo orden que upsert_ronda_libre_scores (si no, deadlock con un
  -- guardado de golpes en esa ronda; migración 20261118120000).
  UPDATE rondas_libres
  SET    admin_user_id = NULL, admin_mode = false
  WHERE  admin_user_id = p_user_id
    AND  creador_id IS DISTINCT FROM p_user_id;

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

  -- Las rondas libres que creó: sin otros usuarios (verificado arriba). Arrastra sus filas y las de
  -- sus invitados (ronda_libre_jugadores.user_id → profiles es NO ACTION).
  DELETE FROM rondas_libres WHERE creador_id = p_user_id;

  -- Arrastra profiles y todo lo que cuelga de profiles o de auth.users (CASCADE / SET NULL).
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
END;
$function$;

-- Privilegios (sin cambios respecto de prod; declarados por el canario privado-por-defecto).
REVOKE ALL ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) TO anon, authenticated, service_role;
-- Interna: solo la llaman marcar_puntito_ronda_libre y marcar_retiro_ronda_libre (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.timba_ronda_para_escribir(text, uuid) FROM PUBLIC, anon, authenticated;
-- Solo el servidor (service_role) borra cuentas.
REVOKE ALL ON FUNCTION public.eliminar_cuenta(uuid) FROM PUBLIC, anon, authenticated;
