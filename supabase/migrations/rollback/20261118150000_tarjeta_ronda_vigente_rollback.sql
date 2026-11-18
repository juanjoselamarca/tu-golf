-- Rollback de 20261118150000_tarjeta_ronda_vigente.sql: enroll_player vuelve al INSERT de la ronda 1.
BEGIN;

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

  -- INSERT rounds en la MISMA transacción: si falla, se revierte el jugador.
  INSERT INTO rounds (tournament_id, player_id, status)
  VALUES (p_tournament_id, v_player_id, 'in_progress');

  RETURN jsonb_build_object('ok', true, 'player_id', v_player_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.asegurar_tarjeta_vigente(uuid, uuid);

COMMIT;
