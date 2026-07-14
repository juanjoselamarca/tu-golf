-- 20260713_enroll_player_rpc.sql
--
-- Inscripción ATÓMICA de un jugador a un torneo (players + rounds) en UNA sola
-- transacción, con el cupo verificado bajo un lock de fila.
--
-- Por qué (CERO FALLOS): antes `enrollPlayer` (TS) hacía tres pasos sueltos —
-- contar inscritos, INSERT players, INSERT rounds best-effort. Dos agujeros:
--   1) Orphan round: si el INSERT rounds fallaba, el jugador quedaba en `players`
--      SIN su `rounds` → leaderboard/scoring roto para ese jugador en pleno torneo.
--   2) Cupo no atómico: el conteo era check-then-insert sin lock → bajo
--      concurrencia entraban jugadores de más del cupo.
--
-- Esta función cierra ambos: `SELECT ... FOR UPDATE` sobre la fila del torneo
-- serializa las altas concurrentes del MISMO torneo (cupo atómico), y los dos
-- INSERT viven en la misma transacción de la función: si la ronda falla, el
-- jugador se revierte con ella (nunca queda a medias).
--
-- El gate de status (¿'open'?) NO vive acá: su fuente única es
-- `isInscribibleStatus` en src/lib/data/tournaments/enrollPlayer.ts (la UI y el
-- backend comparten ese predicado). Acá sólo va lo que EXIGE atomicidad.
--
-- Idempotente: CREATE OR REPLACE. Additiva: nada la llama hasta que despliegue
-- el código que la consume.

CREATE OR REPLACE FUNCTION public.enroll_player(
  p_tournament_id uuid,
  p_kind          text,     -- 'registered' | 'guest'
  p_user_id       uuid,     -- registrado (NULL para invitado)
  p_guest_name    text,     -- invitado  (NULL para registrado)
  p_handicap      numeric,  -- players.handicap_at_registration (course hcp ya resuelto / índice crudo)
  p_category_id   uuid      -- NULL si no hay categoría
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max       integer;
  v_approved  integer;
  v_player_id uuid;
BEGIN
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

  -- INSERT players. Sub-bloque para mapear violaciones a un resultado tipado
  -- (sin romper la transacción entera por un duplicado esperado).
  BEGIN
    IF p_kind = 'registered' THEN
      INSERT INTO players (tournament_id, user_id, category_id, handicap_at_registration, status)
      VALUES (p_tournament_id, p_user_id, p_category_id, p_handicap, 'approved')
      RETURNING id INTO v_player_id;
    ELSE
      -- Invitado: user_id NULL + pending_user_id (CHECK players_identity_check).
      -- pending_user_id único evita choques; si el invitado reclama su cuenta se linkea.
      INSERT INTO players (tournament_id, pending_user_id, player_name, category_id, handicap_at_registration, status)
      VALUES (p_tournament_id, gen_random_uuid(), p_guest_name, p_category_id, p_handicap, 'approved')
      RETURNING id INTO v_player_id;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_registered', 'message', 'Ya estás inscrito en este torneo.');
    WHEN check_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_data', 'message', 'Faltan datos en el perfil. Verifica que haya nombre y handicap configurados.');
  END;

  -- INSERT rounds en la MISMA transacción. Si falla, la excepción se propaga
  -- fuera de la función (sin handler externo) → se revierte TODO, incluido el
  -- jugador: nunca queda un jugador sin su ronda.
  INSERT INTO rounds (tournament_id, player_id, status)
  VALUES (p_tournament_id, v_player_id, 'in_progress');

  RETURN jsonb_build_object('ok', true, 'player_id', v_player_id);
END;
$$;

-- Sólo el service_role (route handlers ya autenticados) puede ejecutarla.
REVOKE ALL ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid) TO service_role;
