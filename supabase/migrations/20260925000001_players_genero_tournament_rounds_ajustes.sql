-- ============================================================
-- Golfers+ — Migración: género congelado en players + ajustes de tournament_rounds
-- (code review Opus del PR #421, 25-sep-2026)
-- ============================================================

-- ------------------------------------------------------------
-- 1. players.genero — el género del jugador se CONGELA al inscribirse, igual
--    que handicap_at_registration.
--
-- Por qué: `profiles` es SELECT sólo para authenticated. Si el board leyera
-- `profiles.genero`, el handicap dependería de QUIÉN mira: anon en /torneo,
-- /en-vivo o /tv (y el invitado en el scorer) verían el rating masculino del
-- tee, mientras el organizador y el service role verían el femenino. Además,
-- editar el perfil recalcularía torneos cerrados. Congelado en `players`,
-- todos los lectores ven lo mismo y el resultado no cambia después.
-- ------------------------------------------------------------
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS genero TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_genero_check') THEN
    ALTER TABLE public.players ADD CONSTRAINT players_genero_check CHECK (genero IN ('M', 'F'));
  END IF;
END $$;

COMMENT ON COLUMN public.players.genero IS
  'Género del jugador congelado al inscribirse (M|F). Elige el tee de la fila VARONES o DAMAS de la cancha (resolvePlayerTee). NULL = desconocido: el motor no desambigua.';

-- Backfill de los inscritos existentes desde su perfil (sólo valores válidos).
UPDATE public.players p
SET genero = pr.genero
FROM public.profiles pr
WHERE pr.id = p.user_id
  AND p.genero IS NULL
  AND pr.genero IN ('M', 'F');

-- ------------------------------------------------------------
-- 2. RPC enroll_player con p_genero (DEFAULT NULL: el código en prod que
--    todavía llama con 6 argumentos sigue funcionando hasta el deploy).
--    Se reemplaza la firma vieja para que no queden dos sobrecargas.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enroll_player(uuid, text, uuid, text, numeric, uuid);

CREATE OR REPLACE FUNCTION public.enroll_player(
  p_tournament_id uuid,
  p_kind          text,     -- 'registered' | 'guest'
  p_user_id       uuid,     -- registrado (NULL para invitado)
  p_guest_name    text,     -- invitado  (NULL para registrado)
  p_handicap      numeric,  -- players.handicap_at_registration (course hcp ya resuelto / índice crudo)
  p_category_id   uuid,     -- NULL si no hay categoría
  p_genero        text DEFAULT NULL  -- 'M' | 'F' | NULL: congelado en players.genero
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 3. tournament_rounds — ajustes del review.
-- ------------------------------------------------------------

-- 3a. Visibilidad heredada del torneo (antes USING(true)). Bajo RLS, el
--     EXISTS sobre `tournaments` aplica las políticas de `tournaments` para
--     quien consulta: público sólo en open/in_progress/closed/published, el
--     organizador siempre.
DROP POLICY IF EXISTS tournament_rounds_select ON public.tournament_rounds;
CREATE POLICY tournament_rounds_select ON public.tournament_rounds
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_rounds.tournament_id)
  );

-- 3b. Columnas que se guardaban y nadie leía. `custom_si` tampoco se persiste
--     para la ronda 1 (mapTournamentForInsert no lo lee) y
--     `tee_assignment_mode` es del torneo (`tournaments.tees`; TeesSection
--     sincroniza todas las rondas al mismo modo). Un dato que se escribe y no
--     se lee es una segunda copia esperando divergir. La tabla tiene 0 filas.
ALTER TABLE public.tournament_rounds DROP COLUMN IF EXISTS custom_si;
ALTER TABLE public.tournament_rounds DROP COLUMN IF EXISTS tee_assignment_mode;
ALTER TABLE public.tournament_rounds DROP COLUMN IF EXISTS notes;

-- 3c. FK a courses explícitamente RESTRICT + índice: una cancha referenciada
--     por una ronda no se borra sin repuntar antes (`repointRounds` en
--     lib/data/course-dedup.ts mueve tournament_rounds junto con
--     historical_rounds).
ALTER TABLE public.tournament_rounds DROP CONSTRAINT IF EXISTS tournament_rounds_course_id_fkey;
ALTER TABLE public.tournament_rounds
  ADD CONSTRAINT tournament_rounds_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_course
  ON public.tournament_rounds (course_id);
