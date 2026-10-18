-- Eliminar cuenta: todo o nada, en UNA transacción.
--
-- Antes, DELETE /api/profile/delete-account borraba tabla por tabla con service role e ignoraba cada
-- error. Para un jugador que jugó un torneo con grupos (13 de 48 perfiles al 18-oct-2026), su fila de
-- ronda_libre_jugadores está referenciada por tournament_group_players (NO ACTION): ese DELETE fallaba
-- callado, el de profiles también (ronda_libre_jugadores.user_id es NO ACTION) y el de auth.users
-- devolvía error. Resultado: historial, sesiones del coach y patrones ya borrados, la cuenta viva y el
-- usuario viendo "Error al eliminar la cuenta". Además, borrar a un organizador arrastraba (CASCADE)
-- los torneos donde jugaron otras personas.
--
-- Ahora:
--   1. Si borrar la cuenta destruiría tarjetas de OTRAS personas, no se borra nada y se devuelve el
--      motivo (`bloqueos`): torneos que organiza con otros jugadores (invitados incluidos: el torneo
--      es público) y rondas libres que creó con otros usuarios registrados (los invitados sin cuenta
--      de su propia ronda no tienen otro dueño y se van con ella).
--   2. Si no, se sueltan las referencias NO ACTION que el CASCADE de auth.users no cubre y se borra
--      auth.users, que arrastra profiles y el resto. Cualquier FK no prevista aborta la transacción
--      entera: nunca queda una cuenta a medio borrar.
--
-- Solo service role (la API valida la sesión y pasa su propio user.id) o una sesión SQL directa.
-- Rollback: supabase/migrations/rollback/20261018_eliminar_cuenta_atomica_rollback.sql

CREATE OR REPLACE FUNCTION public.eliminar_cuenta(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueos text[] := ARRAY[]::text[];
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

  -- Referencias NO ACTION que el CASCADE de auth.users → profiles no suelta, en orden de dependencia.
  -- Sus grupos en torneos ajenos (tournament_group_players → ronda_libre_jugadores).
  DELETE FROM tournament_group_players
  WHERE jugador_ronda_id IN (SELECT id FROM ronda_libre_jugadores WHERE user_id = p_user_id);

  -- Sus sesiones del coach apuntan a sus rondas y torneos (NO ACTION).
  DELETE FROM taiger_sessions WHERE user_id = p_user_id;

  -- Sus torneos: sin otros jugadores (verificado arriba). Arrastra grupos, players, rounds y hole_scores.
  DELETE FROM tournaments WHERE organizer_id = p_user_id;

  -- Su participación en rondas libres (ronda_libre_jugadores.user_id → profiles es NO ACTION).
  DELETE FROM ronda_libre_jugadores WHERE user_id = p_user_id;

  -- Las rondas libres que creó: sin otros usuarios (verificado arriba).
  DELETE FROM rondas_libres WHERE creador_id = p_user_id;

  -- Arrastra profiles y todo lo que cuelga de profiles o de auth.users (CASCADE / SET NULL).
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_cuenta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_cuenta(uuid) TO service_role;
