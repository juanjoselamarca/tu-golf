-- Tarjeta de la RONDA VIGENTE al inscribir (y función para asegurarla).
--
-- Por qué: enroll_player creaba siempre la tarjeta de la ronda 1 (default de round_number). En un torneo
-- multi-ronda con la ronda 2 en juego, un alta tardía (el organizador puede agregar jugadores con el torneo
-- iniciado) dejaba al jugador con una tarjeta abierta de la ronda 1: activeRoundOf la elegía y sus golpes se
-- guardaban en la ronda 1. Y si el inicio o la apertura de ronda se saltaban a un jugador aprobado, nada le
-- creaba la tarjeta: anotaba en papel toda la ronda.
--
-- Qué hace:
--   · asegurar_tarjeta_vigente(torneo, jugador): idempotente. Jugador aprobado, torneo no cerrado: devuelve su
--     tarjeta de la ronda vigente (la mayor con tarjetas; sin tarjetas, la 1) y la crea si falta, salvo
--     entre rondas (vigente cerrada y queda una siguiente: esa la abre startNextRound). Nunca crea tarjetas de rondas anteriores (no bloquean "rondas sin finalizar" ni
--     entran al acumulado). Solo service_role: la ruta del servidor autoriza al jugador o al organizador.
--   · enroll_player la usa en vez del INSERT fijo a la ronda 1. Antes del inicio, el mismo resultado.
--
-- Prod al 17-nov-2026 (solo lectura): 0 torneos multi-ronda, 0 jugadores con tarjeta fuera de la vigente.
-- Rollback: supabase/migrations/rollback/20261118150000_tarjeta_ronda_vigente_rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.asegurar_tarjeta_vigente(p_tournament_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tstatus  text;
  v_total    integer;
  v_pstatus  text;
  v_vigente  integer;
  v_round_id uuid;
BEGIN
  -- Mismo lock que enroll_player: serializa con las altas del torneo.
  SELECT status, coalesce(total_rounds, 1) INTO v_tstatus, v_total FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  END IF;

  SELECT status INTO v_pstatus FROM players WHERE id = p_player_id AND tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
  END IF;
  -- WD/DQ (o pendiente) no juegan: sin tarjeta.
  IF v_pstatus IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_active');
  END IF;
  -- Torneo finalizado (= FINALIZADO_STATUSES de src/golf/tournament-live-status.ts; lo vigila un canario).
  IF v_tstatus IN ('closed', 'published', 'finished') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tournament_closed');
  END IF;

  -- Ronda vigente = la mayor con tarjetas (la misma regla que startNextRound). Sin tarjetas: la 1.
  SELECT max(round_number) INTO v_vigente FROM rounds WHERE tournament_id = p_tournament_id;
  v_vigente := coalesce(v_vigente, 1);

  SELECT id INTO v_round_id FROM rounds
  WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND round_number = v_vigente;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', false);
  END IF;

  -- ENTRE RONDAS (la vigente ya cerrada y queda una siguiente) no se crea nada: una tarjeta abierta ahí
  -- bloquearía "abrir la ronda siguiente", y startNextRound crea la de la siguiente para cada fila de players
  -- (hoy todas, incluidos WD/DQ y pendientes). En la ÚLTIMA ronda (o un torneo de una ronda) sí se crea aunque
  -- las demás tarjetas estén cerradas: si no, el jugador agregado tarde quedaba sin tarjeta para siempre.
  -- Estados de tarjeta cerrada = CLOSED_ROUND_STATUSES de src/golf/tournament-rounds.ts (canario).
  -- Nunca se crean tarjetas de rondas ANTERIORES que el jugador no jugó.
  IF v_vigente < v_total
     AND EXISTS (SELECT 1 FROM rounds WHERE tournament_id = p_tournament_id)
     AND NOT EXISTS (
       SELECT 1 FROM rounds
       WHERE tournament_id = p_tournament_id AND round_number = v_vigente
         AND status NOT IN ('closed', 'official')
     ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'round_not_in_play', 'round_number', v_vigente);
  END IF;

  INSERT INTO rounds (tournament_id, player_id, round_number, status)
  VALUES (p_tournament_id, p_player_id, v_vigente, 'in_progress')
  ON CONFLICT (tournament_id, player_id, round_number) DO NOTHING
  RETURNING id INTO v_round_id;

  IF v_round_id IS NULL THEN
    SELECT id INTO v_round_id FROM rounds
    WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND round_number = v_vigente;
    RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enroll_player(p_tournament_id uuid, p_kind text, p_user_id uuid, p_guest_name text, p_handicap numeric, p_category_id uuid, p_genero text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max       integer;
  v_approved  integer;
  v_player_id uuid;
  v_genero    text;
BEGIN
  -- Sólo M/F entran; cualquier otra cosa se guarda como NULL (desconocido).
  v_genero := CASE WHEN p_genero IN ('M', 'F') THEN p_genero ELSE NULL END;

  -- Lock de la fila del torneo: serializa las inscripciones concurrentes del
  -- mismo torneo. Mientras esta transacción no comitee, otra alta al mismo
  -- torneo espera acá → el conteo de cupo de abajo es atómico.
  SELECT max_players INTO v_max
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_data', 'message', 'Torneo no encontrado.');
  END IF;

  -- Cupo (atómico bajo el lock). Sólo inscritos activos ('approved') ocupan cupo.
  IF v_max IS NOT NULL AND v_max > 0 THEN
    SELECT count(*) INTO v_approved
    FROM players
    WHERE tournament_id = p_tournament_id AND status = 'approved';

    IF v_approved >= v_max THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'tournament_full',
        'message', format('El torneo alcanzó su cupo máximo (%s jugadores). Amplía el cupo máximo del torneo para agregar más.', v_max)
      );
    END IF;
  END IF;

  BEGIN
    IF p_kind = 'registered' THEN
      INSERT INTO players (tournament_id, user_id, category_id, handicap_at_registration, status, genero)
      VALUES (p_tournament_id, p_user_id, p_category_id, p_handicap, 'approved', v_genero)
      RETURNING id INTO v_player_id;
    ELSE
      INSERT INTO players (tournament_id, pending_user_id, player_name, category_id, handicap_at_registration, status, genero)
      VALUES (p_tournament_id, gen_random_uuid(), p_guest_name, p_category_id, p_handicap, 'approved', v_genero)
      RETURNING id INTO v_player_id;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_registered', 'message', 'Ya estás inscrito en este torneo.');
    WHEN check_violation OR not_null_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_data', 'message', 'Faltan datos en el perfil. Verifica que haya nombre y handicap configurados.');
  END;

  -- La tarjeta de la RONDA VIGENTE en la MISMA transacción (si falla, se revierte el jugador).
  -- Antes era siempre la ronda 1: un alta con la ronda 2 en juego anotaba en la ronda 1.
  PERFORM public.asegurar_tarjeta_vigente(p_tournament_id, v_player_id);

  RETURN jsonb_build_object('ok', true, 'player_id', v_player_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.asegurar_tarjeta_vigente(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asegurar_tarjeta_vigente(uuid, uuid) TO service_role;
-- enroll_player se recrea: sus privilegios se declaran igual que hoy en prod (solo service_role).
REVOKE ALL ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) TO service_role;

COMMIT;
