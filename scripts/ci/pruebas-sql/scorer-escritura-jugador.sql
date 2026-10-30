-- Pruebas SQL de 20261030120000_jugador_no_edita_su_fila_del_scorer con ROLES REALES (authenticated + su JWT),
-- contra el Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige: el jugador de una ronda (por ejemplo, cada inscrito de un torneo, a quien `startTournament` le crea su
-- fila CON su user_id) no puede hacer UPDATE de su propia fila de ronda_libre_jugadores. Sin la migración, la policy
-- `jugador_update_scores` dejaba pasar los tres UPDATE de abajo: handicap (su neto en el leaderboard), scores (su
-- tarjeta, sin las validaciones de /api/game) y ronda_id (meterse en una ronda ajena sin ser su creador).
-- Un UPDATE sin policy que lo autorice no da error: afecta 0 filas. Por eso cada caso mira ROW_COUNT.
--
-- Y exige que siga funcionando lo que el código sí usa: el creador gestiona las filas de SU ronda
-- (`gestionar_jugadores`, el INSERT de /api/ronda-libre/create) y nadie más inserta ahí.
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado (psql con ON_ERROR_STOP corta ahí y
-- el job queda rojo). Todo corre en una transacción que termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
-- Organizador = creador de la ronda del torneo. Jugador = inscrito con cuenta. Ajeno = creador de otra ronda.
INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'organizador@prueba.test'),
  ('b1000000-0000-4000-8000-000000000002', 'jugador@prueba.test'),
  ('c1000000-0000-4000-8000-000000000003', 'ajeno@prueba.test');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  -- La ronda que materializa un torneo: la crea el organizador, no el jugador.
  ('d1000000-0000-4000-8000-000000000001', 'TORNEO', 'Cancha', current_date,
   'a1000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso'),
  -- Una ronda de un tercero, para el intento de mudarse de ronda.
  ('d1000000-0000-4000-8000-000000000002', 'AJENAA', 'Cancha', current_date,
   'c1000000-0000-4000-8000-000000000003', 'stroke_play', 18, 'en_curso');

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, scores) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Jugador',
   'b1000000-0000-4000-8000-000000000002', 12, '{"1": 5}'::jsonb);

-- ── El jugador de la ronda (no es su creador) ────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores SET handicap = 54
   WHERE id = 'e1000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el jugador cambió su handicap (% filas)', n; END IF;
  RAISE NOTICE 'OK el jugador no cambia su propio handicap -> 0 filas';
END $$;

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores SET scores = '{"1": 1, "2": 1}'::jsonb
   WHERE id = 'e1000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el jugador escribió su tarjeta directo (% filas)', n; END IF;
  RAISE NOTICE 'OK el jugador no escribe su tarjeta sin pasar por el RPC -> 0 filas';
END $$;

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores SET ronda_id = 'd1000000-0000-4000-8000-000000000002'
   WHERE id = 'e1000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el jugador se mudó a una ronda ajena (% filas)', n; END IF;
  RAISE NOTICE 'OK el jugador no se muda a una ronda ajena -> 0 filas';
END $$;

DO $$ BEGIN
  INSERT INTO public.ronda_libre_jugadores (ronda_id, nombre, user_id)
  VALUES ('d1000000-0000-4000-8000-000000000001', 'Colado', 'b1000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'FALLA: el jugador insertó una fila en una ronda que no creó';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK el jugador no inserta en una ronda ajena -> 42501';
END $$;

-- rounds y hole_scores: sin policy de escritura desde 20261019120000, el permiso tampoco queda.
DO $$ BEGIN
  IF has_table_privilege('authenticated', 'public.rounds', 'INSERT')
     OR has_table_privilege('authenticated', 'public.rounds', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.rounds', 'DELETE')
     OR has_table_privilege('authenticated', 'public.hole_scores', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hole_scores', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hole_scores', 'DELETE') THEN
    RAISE EXCEPTION 'FALLA: authenticated conserva permisos de escritura en rounds u hole_scores';
  END IF;
  RAISE NOTICE 'OK authenticated: sin INSERT/UPDATE/DELETE en rounds ni hole_scores';
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.rounds LIMIT 1;
  PERFORM 1 FROM public.hole_scores LIMIT 1;
  RAISE NOTICE 'OK authenticated sigue leyendo rounds y hole_scores (leaderboard con sesión)';
END $$;

-- ── El creador de la ronda (lo que el código sí usa) ─────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores SET handicap = 14
   WHERE id = 'e1000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: el creador perdió gestionar_jugadores (% filas)', n; END IF;
  RAISE NOTICE 'OK el creador de la ronda sigue gestionando sus filas -> 1 fila';
END $$;

DO $$ BEGIN
  INSERT INTO public.ronda_libre_jugadores (ronda_id, nombre, user_id)
  VALUES ('d1000000-0000-4000-8000-000000000001', 'Rival', NULL);
  RAISE NOTICE 'OK el creador sigue insertando jugadores (/api/ronda-libre/create)';
END $$;

ROLLBACK;
