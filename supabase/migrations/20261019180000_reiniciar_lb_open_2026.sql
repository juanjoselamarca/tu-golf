-- Reinicia el torneo "LB OPEN 2026 PADRE E HIJO" (lb-open-2026-padre-e-hijo-mpleeet7).
--
-- Se inició de prueba el 25-may-2026, antes de #510: sus 4 tarjetas de grupo quedaron en
-- stroke_play/gross (el torneo es scramble neto) y en estado `finalizada`, sin un solo golpe
-- anotado. Juanjo decidió reiniciarlo (19-oct-2026) para que el día del torneo se inicie
-- limpio y las tarjetas nazcan con el formato y el modo del torneo.
--
-- Deshace exactamente lo que arma `startTournament` (mismo orden que `deshacerGrupo`):
--   1. suelta tournament_group_players.jugador_ronda_id (FK sin cascada);
--   2. suelta tournament_groups.ronda_libre_id (FK sin cascada);
--   3. borra las rondas_libres de esos grupos (cascada a jugadores, equipos y pairings);
--   4. borra las tarjetas `rounds` del torneo (cascada a hole_scores, hoy 0);
--   5. vuelve el torneo a `open` (inscripción abierta, los 5 jugadores aprobados se conservan).
--
-- Guardas: si alguien anotó un golpe, si una sesión del coach o un plan_outcome apunta a esas
-- tarjetas, o si un jugador de grupo está enlazado a otra tarjeta, la migración ABORTA entera y
-- no toca nada. Si el torneo ya no está in_progress, no hace nada.
DO $reiniciar_lb_open$
DECLARE
  t_id constant uuid := '8007921c-9053-436d-9d9d-06f0865ac11c';
  rondas uuid[];
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = t_id AND status = 'in_progress') THEN
    RAISE NOTICE 'reiniciar_lb_open: el torneo ya no está in_progress; no se hace nada.';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(ronda_libre_id), '{}') INTO rondas
  FROM public.tournament_groups WHERE tournament_id = t_id AND ronda_libre_id IS NOT NULL;

  IF cardinality(rondas) <> 4 THEN
    RAISE EXCEPTION 'reiniciar_lb_open: se esperaban 4 tarjetas de grupo y hay %', cardinality(rondas);
  END IF;

  SELECT count(*) INTO n FROM public.hole_scores h JOIN public.rounds r ON r.id = h.round_id WHERE r.tournament_id = t_id;
  IF n > 0 THEN RAISE EXCEPTION 'reiniciar_lb_open: hay % hole_scores anotados', n; END IF;

  SELECT count(*) INTO n FROM public.ronda_libre_jugadores j
  WHERE j.ronda_id = ANY(rondas) AND jsonb_typeof(j.scores) = 'object' AND j.scores <> '{}'::jsonb;
  IF n > 0 THEN RAISE EXCEPTION 'reiniciar_lb_open: % jugadores tienen golpes en las tarjetas de grupo', n; END IF;

  SELECT count(*) INTO n FROM public.taiger_sessions WHERE ronda_libre_id = ANY(rondas);
  IF n > 0 THEN RAISE EXCEPTION 'reiniciar_lb_open: % sesiones del coach apuntan a estas tarjetas', n; END IF;

  -- plan_outcomes: ON DELETE SET NULL + CHECK (historical_round_id OR ronda_libre_id) → abortaría críptico.
  SELECT count(*) INTO n FROM public.plan_outcomes WHERE ronda_libre_id = ANY(rondas);
  IF n > 0 THEN RAISE EXCEPTION 'reiniciar_lb_open: % plan_outcomes apuntan a estas tarjetas', n; END IF;

  -- Un jugador de grupo enlazado a una fila de OTRA tarjeta sería una inconsistencia: se aborta, no se tapa.
  SELECT count(*) INTO n FROM public.tournament_group_players gp
  JOIN public.tournament_groups g ON g.id = gp.group_id
  WHERE g.tournament_id = t_id AND gp.jugador_ronda_id IS NOT NULL
    AND gp.jugador_ronda_id NOT IN (SELECT id FROM public.ronda_libre_jugadores WHERE ronda_id = ANY(rondas));
  IF n > 0 THEN RAISE EXCEPTION 'reiniciar_lb_open: % jugadores de grupo enlazados fuera de estas tarjetas', n; END IF;

  UPDATE public.tournament_group_players gp SET jugador_ronda_id = NULL
  FROM public.tournament_groups g
  WHERE gp.group_id = g.id AND g.tournament_id = t_id
    AND gp.jugador_ronda_id IN (SELECT id FROM public.ronda_libre_jugadores WHERE ronda_id = ANY(rondas));

  UPDATE public.tournament_groups SET ronda_libre_id = NULL WHERE tournament_id = t_id AND ronda_libre_id = ANY(rondas);

  DELETE FROM public.rondas_libres WHERE id = ANY(rondas);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'reiniciar_lb_open: se borraron % tarjetas de grupo (esperaba 4)', n; END IF;

  DELETE FROM public.rounds WHERE tournament_id = t_id;

  UPDATE public.tournaments SET status = 'open' WHERE id = t_id AND status = 'in_progress';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'reiniciar_lb_open: no se pudo volver el torneo a open'; END IF;

  RAISE NOTICE 'reiniciar_lb_open: torneo reiniciado (4 tarjetas de grupo borradas, estado open).';
END
$reiniciar_lb_open$;
