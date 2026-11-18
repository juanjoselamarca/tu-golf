-- "Ronda en juego" cuenta solo tarjetas de jugadores APROBADOS (follow-up de #828).
--
-- Por qué: retirar (WD) o descalificar (DQ) a un jugador no cierra su tarjeta (se preserva tal cual, reglamento).
-- asegurar_tarjeta_vigente contaba esa tarjeta abierta como "la ronda sigue en juego": en un torneo multi-ronda, con
-- todos los demás ya cerrados, un alta tardía o el "Buscar mi tarjeta" creaba una tarjeta en una ronda que ya
-- terminó, y esa tarjeta nueva bloqueaba abrir la ronda siguiente. startNextRound (src/app/api/game/round-actions.ts)
-- pasa a usar la misma regla y a crear tarjetas solo para los aprobados.
--
-- Qué cambia: solo el NOT EXISTS de "en juego" (JOIN players, status = 'approved'). Lo demás de la función, igual.
-- Prod al 17-nov-2026: 0 torneos multi-ronda. Preventivo.
-- Rollback: supabase/migrations/rollback/20261119100000_tarjeta_vigente_solo_aprobados_rollback.sql

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
  -- bloquearía "abrir la ronda siguiente", y startNextRound crea la de la siguiente para cada jugador aprobado.
  -- En la ÚLTIMA ronda (o un torneo de una ronda) sí se crea aunque las demás tarjetas estén cerradas: si no, el
  -- jugador agregado tarde quedaba sin tarjeta para siempre.
  -- "En juego" = alguna tarjeta ABIERTA de un jugador APROBADO (= contarTarjetasEnJuego de
  -- src/lib/data/tournaments/siguiente-ronda.ts). La tarjeta abierta de un retirado (WD) o descalificado (DQ) no
  -- cuenta: retirarse no la cierra (se preserva tal cual) y no puede dejar la ronda "en juego" para siempre.
  -- Estados de tarjeta cerrada = CLOSED_ROUND_STATUSES de src/golf/tournament-rounds.ts (canario).
  -- Nunca se crean tarjetas de rondas ANTERIORES que el jugador no jugó.
  IF v_vigente < v_total
     AND EXISTS (SELECT 1 FROM rounds WHERE tournament_id = p_tournament_id)
     AND NOT EXISTS (
       SELECT 1 FROM rounds r
       JOIN players pl ON pl.id = r.player_id
       WHERE r.tournament_id = p_tournament_id AND r.round_number = v_vigente
         AND r.status NOT IN ('closed', 'official')
         AND pl.status = 'approved'
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

REVOKE ALL ON FUNCTION public.asegurar_tarjeta_vigente(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asegurar_tarjeta_vigente(uuid, uuid) TO service_role;

COMMIT;
