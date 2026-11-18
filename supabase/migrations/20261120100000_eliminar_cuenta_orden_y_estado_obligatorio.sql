-- eliminar_cuenta toma los bloqueos en el mismo orden que el resto, y rondas_libres.estado pasa a ser obligatorio.
-- Seguimiento de la revisión de la migración 20261118120000 (PR #826). Parte de las definiciones vigentes en prod.
--
-- 1. eliminar_cuenta anonimiza su inscripción en torneos ajenos (UPDATE players) ANTES de tocar sus tarjetas
--    (UPDATE ronda_libre_jugadores). editar_handicap_inscrito bloquea players y después la tarjeta; en el orden
--    inverso, borrar la cuenta de un inscrito mientras el organizador le cambia el hándicap podía terminar en
--    deadlock (Postgres aborta una de las dos; improbable, pero evitable). Es la única sentencia que cambia de
--    lugar; el resto de la función queda idéntico (lo fija el canario perfil-sugerido-sin-poderes).
-- 2. rondas_libres.estado NOT NULL. Ya tenía default 'en_curso' y el CHECK, pero un NULL pasaba el CHECK y dejaba
--    la ronda en un estado que ni cierra ni acepta golpes. Prod tiene 0 filas con estado NULL (verificado el
--    18-nov), así que el ALTER no toca datos.

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

  -- Su inscripción en torneos ajenos (sus rounds/hole_scores sostienen el leaderboard y los premios): se
  -- desvincula y se anonimiza. Va ANTES de tocar tarjetas: players antes que ronda_libre_jugadores, el mismo orden
  -- que editar_handicap_inscrito (si no, deadlock con un cambio de hándicap del inscrito; migración 20261120100000). players exige user_id XOR pending_user_id (CHECK): queda como invitado con un id nuevo
  -- que nadie conoce, así que nadie puede reclamar esa tarjeta.
  UPDATE players
  SET    user_id = NULL, pending_user_id = gen_random_uuid(), player_name = c_anonimo
  WHERE  user_id = p_user_id OR pending_user_id = p_user_id;

  -- Su tarjeta en rondas ajenas: se desvincula y se anonimiza, no se borra (best ball, match play y el
  -- grupo de un torneo ajeno dependen de esa fila).
  UPDATE ronda_libre_jugadores j
  SET    user_id = NULL, pending_user_id = NULL, nombre = c_anonimo,
         nombre_invitado = NULL, telefono_invitado = NULL
  WHERE  j.user_id = p_user_id
    AND  NOT EXISTS (SELECT 1 FROM rondas_libres r WHERE r.id = j.ronda_id AND r.creador_id = p_user_id);

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

REVOKE ALL ON FUNCTION public.eliminar_cuenta(uuid) FROM PUBLIC, anon, authenticated;

-- Solo metadatos más un scan de una tabla chica, pero si el ALTER queda en cola detrás de una transacción larga
-- bloquearía todas las lecturas y golpes de rondas: mejor fallar rápido y reintentar la corrida.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.rondas_libres ALTER COLUMN estado SET NOT NULL;
