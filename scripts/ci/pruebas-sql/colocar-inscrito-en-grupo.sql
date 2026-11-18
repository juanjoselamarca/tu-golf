-- Pruebas SQL de 20261122100000_colocar_inscrito_en_grupo (#814 · PR2), contra el Postgres desechable del check
-- `esquema` (scripts/ci/esquema.mjs) con todas las migraciones aplicadas.
--
-- Qué exige:
--   · permisos: solo service_role ejecuta la RPC (anon/authenticated no, ni el helper de anotaciones);
--   · control optimista: un esperado que no calza devuelve `conflicto` y no escribe;
--   · torneo no en juego y tarjeta cerrada: no escribe;
--   · mover con golpes conserva la fila (id, golpes) y el enlace; agregar crea fila y enlace;
--   · D12 aprueba (y respeta el cupo), D11, #828 (tarjeta individual), D1 borrar con y sin golpes, borrar a un WD;
--   · equipos: equipo creado y equipo borrado, D3 (equipo con golpes bajo el mínimo), D13 (todas las filas WD/DQ
--     salen), mejor bola con un DQ en un hoyo sin cubrir (`equipo-al-pie`);
--   · match play: D10, D6, D8 y el formato de la tarjeta, que decide la RPC;
--   · mejor bola: D2, `equipo-al-pie` y el control negativo (DQ con el hoyo cubierto pasa);
--   · foursome: `equipo-lleno`, `equipo-al-pie` con golpes y D13 con dos WD/DQ (uno sin fila);
--   · scramble: `equipo-con-golpes-sin-miembros`; `grupo-sin-tarjeta`, grupo de otro torneo, torneo de varias
--     rondas, borrar a un sin aprobar;
--   · timba en la tarjeta → motivo `tarjeta-con-timba`; match_pairings → RAISE; los triggers grupos_fijos_* siguen
--     activos para el cliente.
-- La concurrencia (locks contra el scorer y el cierre) no se prueba aquí: una sola sesión no la ejercita.
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Ayudas (pg_temp, mueren con la sesión) ───────────────────────────────────────────────────────────────────
-- El esperado que leería el plan, tal como está la base ahora.
CREATE FUNCTION pg_temp.esp(p_p uuid, p_dest uuid) RETURNS jsonb LANGUAGE sql AS $$
  WITH origen AS (SELECT gp.group_id FROM public.tournament_group_players gp WHERE gp.player_id = p_p)
  SELECT jsonb_build_object(
    'inscrito', (SELECT jsonb_build_object('status', p.status, 'handicap', p.handicap_at_registration,
                                           'tee_id', p.tee_id, 'genero', p.genero, 'category_id', p.category_id,
                                           'grupo', (SELECT group_id FROM origen))
                   FROM public.players p WHERE p.id = p_p),
    'grupos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'group_id', g.id, 'ronda_libre_id', g.ronda_libre_id,
                 'jugadores', COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', p.id, 'status', p.status,
                                                                            'handicap', p.handicap_at_registration,
                                                                            'tee_id', p.tee_id, 'genero', p.genero,
                                                                            'category_id', p.category_id))
                                          FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
                                         WHERE gp.group_id = g.id), '[]'::jsonb)))
                 FROM public.tournament_groups g
                WHERE g.id IN (SELECT group_id FROM origen) OR g.id = p_dest), '[]'::jsonb));
$$;

-- La política que arma la app desde las fuentes de TS (isTeamFormat, isSharedBallFormat, jugadoresPorEquipo…).
CREATE FUNCTION pg_temp.pol(f text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'formato', f,
    'equipo', f IN ('best_ball', 'scramble', 'foursome'),
    'bola_compartida', f IN ('scramble', 'foursome'),
    'match_play', f = 'match_play',
    'al_pie_con_retirado', f = 'foursome',
    'jugadores_por_equipo', CASE f WHEN 'foursome' THEN '{"min": 2, "max": 2}'::jsonb
                                   WHEN 'best_ball' THEN '{"min": 2, "max": 4}'::jsonb
                                   WHEN 'scramble' THEN '{"min": 2, "max": 4}'::jsonb ELSE 'null'::jsonb END,
    'jugadores_por_match', 2);
$$;

CREATE FUNCTION pg_temp.colocar(t uuid, p uuid, dest uuid, f text, fila jsonb DEFAULT NULL,
                                equipos jsonb DEFAULT '[]') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.colocar_inscrito_en_grupo(t, p, dest, pg_temp.esp(p, dest), fila, equipos, pg_temp.pol(f), dest IS NULL);
$$;

-- Foto de las tres tablas que la RPC escribe, para comprobar que un "no" no escribió nada.
CREATE FUNCTION pg_temp.foto() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'players', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE p.id::text LIKE 'c8140000-%'),
    'tgp', (SELECT jsonb_agg(to_jsonb(gp) ORDER BY gp.id) FROM public.tournament_group_players gp WHERE gp.group_id::text LIKE 'e8140000-%'),
    'rlj', (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM public.ronda_libre_jugadores j WHERE j.ronda_id::text LIKE 'd8140000-%'),
    'rl', (SELECT jsonb_agg(jsonb_build_object('id', rl.id, 'formato', rl.formato_juego) ORDER BY rl.id) FROM public.rondas_libres rl WHERE rl.id::text LIKE 'd8140000-%'));
$$;

-- Falla si r no es {"ok": false, "motivo": m}.
CREATE FUNCTION pg_temp.debe_negar(r jsonb, m text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (r->>'ok')::boolean OR r->>'motivo' IS DISTINCT FROM m THEN
    RAISE EXCEPTION 'FALLA %: esperaba motivo %, llegó %', caso, m, r;
  END IF;
  RAISE NOTICE 'OK % → %', caso, m;
END $$;

CREATE FUNCTION pg_temp.debe_pasar(r jsonb, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALLA %: esperaba ok, llegó %', caso, r;
  END IF;
END $$;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES ('a8140000-0000-4000-8000-000000000000', 'organizador-814@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status) VALUES
  ('b8140000-0000-4000-8000-000000000001', 'Stroke', 'cg-stroke', 'a8140000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8140000-0000-4000-8000-000000000002', 'Scramble', 'cg-scramble', 'a8140000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8140000-0000-4000-8000-000000000003', 'Foursome', 'cg-foursome', 'a8140000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8140000-0000-4000-8000-000000000004', 'Best ball', 'cg-bestball', 'a8140000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8140000-0000-4000-8000-000000000005', 'Match', 'cg-match', 'a8140000-0000-4000-8000-000000000000', current_date, 'in_progress');

-- players: c814 + torneo + nº. Todos invitados (pending_user_id) salvo P1, con cuenta (user_id = el organizador).
INSERT INTO public.players (id, tournament_id, player_name, handicap_at_registration, status, user_id, pending_user_id) VALUES
  ('c8140000-0000-4000-8000-000000000101', 'b8140000-0000-4000-8000-000000000001', 'P1', 10, 'approved', 'a8140000-0000-4000-8000-000000000000', NULL),
  ('c8140000-0000-4000-8000-000000000102', 'b8140000-0000-4000-8000-000000000001', 'P2', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000103', 'b8140000-0000-4000-8000-000000000001', 'P3', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000104', 'b8140000-0000-4000-8000-000000000001', 'P4', 16, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000105', 'b8140000-0000-4000-8000-000000000001', 'P5', 18, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000106', 'b8140000-0000-4000-8000-000000000001', 'P6', 20, 'waitlist', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000107', 'b8140000-0000-4000-8000-000000000001', 'P7', 22, 'withdrawn', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000108', 'b8140000-0000-4000-8000-000000000001', 'P8', 9, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000109', 'b8140000-0000-4000-8000-000000000001', 'P9', 8, 'pending', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000201', 'b8140000-0000-4000-8000-000000000002', 'S1', 10, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000202', 'b8140000-0000-4000-8000-000000000002', 'S2', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000203', 'b8140000-0000-4000-8000-000000000002', 'S3', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000204', 'b8140000-0000-4000-8000-000000000002', 'S4', 16, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000210', 'b8140000-0000-4000-8000-000000000002', 'S10', 18, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000301', 'b8140000-0000-4000-8000-000000000003', 'F1', 10, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000302', 'b8140000-0000-4000-8000-000000000003', 'F2', 12, 'withdrawn', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000303', 'b8140000-0000-4000-8000-000000000003', 'F3', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000304', 'b8140000-0000-4000-8000-000000000003', 'F4', 15, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000305', 'b8140000-0000-4000-8000-000000000003', 'F5', 10, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000306', 'b8140000-0000-4000-8000-000000000003', 'F6', 11, 'withdrawn', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000307', 'b8140000-0000-4000-8000-000000000003', 'F7', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000308', 'b8140000-0000-4000-8000-000000000003', 'F8', 13, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000309', 'b8140000-0000-4000-8000-000000000003', 'F9', 14, 'withdrawn', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000310', 'b8140000-0000-4000-8000-000000000003', 'F10', 15, 'disqualified', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000311', 'b8140000-0000-4000-8000-000000000003', 'F11', 16, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000401', 'b8140000-0000-4000-8000-000000000004', 'B1', 10, 'disqualified', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000402', 'b8140000-0000-4000-8000-000000000004', 'B2', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000403', 'b8140000-0000-4000-8000-000000000004', 'B3', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000404', 'b8140000-0000-4000-8000-000000000004', 'B4', 10, 'disqualified', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000405', 'b8140000-0000-4000-8000-000000000004', 'B5', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000406', 'b8140000-0000-4000-8000-000000000004', 'B6', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000501', 'b8140000-0000-4000-8000-000000000005', 'M1', 10, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000502', 'b8140000-0000-4000-8000-000000000005', 'M2', 12, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000503', 'b8140000-0000-4000-8000-000000000005', 'M3', 14, 'approved', NULL, gen_random_uuid()),
  ('c8140000-0000-4000-8000-000000000504', 'b8140000-0000-4000-8000-000000000005', 'M4', 16, 'approved', NULL, gen_random_uuid());

-- Tarjetas de grupo: d814 + nº de grupo.
INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d8140000-0000-4000-8000-000000000001', 'CG8141', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000002', 'CG8142', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000003', 'CG8143', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000004', 'CG8144', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000005', 'CG8145', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000006', 'CG8146', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000007', 'CG8147', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'foursome', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000008', 'CG8148', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'best_ball', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000009', 'CG8149', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'match_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000010', 'CG8140', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000012', 'CG8152', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000013', 'CG8153', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'best_ball', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000014', 'CG8154', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'best_ball', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000017', 'CG8157', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'foursome', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000018', 'CG8158', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'foursome', 18, 'en_curso'),
  ('d8140000-0000-4000-8000-000000000019', 'CG8159', 'Cancha', current_date, 'a8140000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso');

-- Filas de tarjeta: f814 + nº de player.
INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, handicap, scores) VALUES
  ('f8140000-0000-4000-8000-000000000101', 'd8140000-0000-4000-8000-000000000001', 'P1', 10, '{"1": 4, "2": 5}'),
  ('f8140000-0000-4000-8000-000000000102', 'd8140000-0000-4000-8000-000000000001', 'P2', 12, '{}'),
  ('f8140000-0000-4000-8000-000000000103', 'd8140000-0000-4000-8000-000000000002', 'P3', 14, '{"1": 6}'),
  ('f8140000-0000-4000-8000-000000000107', 'd8140000-0000-4000-8000-000000000002', 'P7', 22, '{}'),
  ('f8140000-0000-4000-8000-000000000201', 'd8140000-0000-4000-8000-000000000004', 'S1', 10, '{}'),
  ('f8140000-0000-4000-8000-000000000202', 'd8140000-0000-4000-8000-000000000004', 'S2', 12, '{}'),
  ('f8140000-0000-4000-8000-000000000203', 'd8140000-0000-4000-8000-000000000006', 'S3', 14, '{}'),
  ('f8140000-0000-4000-8000-000000000204', 'd8140000-0000-4000-8000-000000000006', 'S4', 16, '{}'),
  ('f8140000-0000-4000-8000-000000000301', 'd8140000-0000-4000-8000-000000000007', 'F1', 10, '{}'),
  ('f8140000-0000-4000-8000-000000000302', 'd8140000-0000-4000-8000-000000000007', 'F2', 12, '{}'),
  ('f8140000-0000-4000-8000-000000000401', 'd8140000-0000-4000-8000-000000000008', 'B1', 10, '{"1": 4}'),
  ('f8140000-0000-4000-8000-000000000402', 'd8140000-0000-4000-8000-000000000008', 'B2', 12, '{"2": 5}'),
  ('f8140000-0000-4000-8000-000000000501', 'd8140000-0000-4000-8000-000000000009', 'M1', 10, '{}'),
  ('f8140000-0000-4000-8000-000000000502', 'd8140000-0000-4000-8000-000000000009', 'M2', 12, '{}'),
  ('f8140000-0000-4000-8000-000000000503', 'd8140000-0000-4000-8000-000000000010', 'M3', 14, '{}'),
  ('f8140000-0000-4000-8000-000000000210', 'd8140000-0000-4000-8000-000000000019', 'S10', 18, '{}'),
  ('f8140000-0000-4000-8000-000000000305', 'd8140000-0000-4000-8000-000000000017', 'F5', 10, '{}'),
  ('f8140000-0000-4000-8000-000000000306', 'd8140000-0000-4000-8000-000000000017', 'F6', 11, '{}'),
  ('f8140000-0000-4000-8000-000000000308', 'd8140000-0000-4000-8000-000000000018', 'F8', 13, '{}'),
  ('f8140000-0000-4000-8000-000000000309', 'd8140000-0000-4000-8000-000000000018', 'F9', 14, '{}'),
  ('f8140000-0000-4000-8000-000000000404', 'd8140000-0000-4000-8000-000000000014', 'B4', 10, '{"1": 4}'),
  ('f8140000-0000-4000-8000-000000000405', 'd8140000-0000-4000-8000-000000000014', 'B5', 12, '{"1": 5}');

INSERT INTO public.ronda_libre_scores_orden (jugador_id, dispositivo, seq)
VALUES ('f8140000-0000-4000-8000-000000000101', gen_random_uuid(), 7);

-- Equipos: el grupo es el equipo. Scramble G6 ya tiene golpes; G5 tiene tarjeta pero no equipo (grupo vacío).
INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego, scores) VALUES
  ('a8140000-0000-4000-8000-000000000e04', 'd8140000-0000-4000-8000-000000000004', 'G4', 3, 3, '{}'),
  ('a8140000-0000-4000-8000-000000000e06', 'd8140000-0000-4000-8000-000000000006', 'G6', 4, 4, '{"1": 4}'),
  ('a8140000-0000-4000-8000-000000000e07', 'd8140000-0000-4000-8000-000000000007', 'G7', 5, 5, '{}'),
  ('a8140000-0000-4000-8000-000000000e08', 'd8140000-0000-4000-8000-000000000008', 'G8', NULL, NULL, '{}'),
  ('a8140000-0000-4000-8000-000000000e14', 'd8140000-0000-4000-8000-000000000014', 'G14', NULL, NULL, '{}'),
  ('a8140000-0000-4000-8000-000000000e17', 'd8140000-0000-4000-8000-000000000017', 'G17', 5, 5, '{"1": 5}'),
  ('a8140000-0000-4000-8000-000000000e18', 'd8140000-0000-4000-8000-000000000018', 'G18', 5, 5, '{}'),
  ('a8140000-0000-4000-8000-000000000e19', 'd8140000-0000-4000-8000-000000000019', 'G19', 4, 4, '{"1": 4}');
INSERT INTO public.ronda_equipo_jugadores (equipo_id, jugador_id, orden) VALUES
  ('a8140000-0000-4000-8000-000000000e04', 'f8140000-0000-4000-8000-000000000201', 0),
  ('a8140000-0000-4000-8000-000000000e04', 'f8140000-0000-4000-8000-000000000202', 1),
  ('a8140000-0000-4000-8000-000000000e06', 'f8140000-0000-4000-8000-000000000203', 0),
  ('a8140000-0000-4000-8000-000000000e06', 'f8140000-0000-4000-8000-000000000204', 1),
  ('a8140000-0000-4000-8000-000000000e07', 'f8140000-0000-4000-8000-000000000301', 0),
  ('a8140000-0000-4000-8000-000000000e07', 'f8140000-0000-4000-8000-000000000302', 1),
  ('a8140000-0000-4000-8000-000000000e08', 'f8140000-0000-4000-8000-000000000401', 0),
  ('a8140000-0000-4000-8000-000000000e08', 'f8140000-0000-4000-8000-000000000402', 1),
  ('a8140000-0000-4000-8000-000000000e14', 'f8140000-0000-4000-8000-000000000404', 0),
  ('a8140000-0000-4000-8000-000000000e14', 'f8140000-0000-4000-8000-000000000405', 1),
  ('a8140000-0000-4000-8000-000000000e17', 'f8140000-0000-4000-8000-000000000305', 0),
  ('a8140000-0000-4000-8000-000000000e17', 'f8140000-0000-4000-8000-000000000306', 1),
  ('a8140000-0000-4000-8000-000000000e18', 'f8140000-0000-4000-8000-000000000308', 0),
  ('a8140000-0000-4000-8000-000000000e18', 'f8140000-0000-4000-8000-000000000309', 1),
  ('a8140000-0000-4000-8000-000000000e19', 'f8140000-0000-4000-8000-000000000210', 0);

-- Grupos: e814 + nº.
INSERT INTO public.tournament_groups (id, tournament_id, name, ronda_libre_id) VALUES
  ('e8140000-0000-4000-8000-000000000001', 'b8140000-0000-4000-8000-000000000001', 'G1', 'd8140000-0000-4000-8000-000000000001'),
  ('e8140000-0000-4000-8000-000000000002', 'b8140000-0000-4000-8000-000000000001', 'G2', 'd8140000-0000-4000-8000-000000000002'),
  ('e8140000-0000-4000-8000-000000000003', 'b8140000-0000-4000-8000-000000000001', 'G3', 'd8140000-0000-4000-8000-000000000003'),
  ('e8140000-0000-4000-8000-000000000004', 'b8140000-0000-4000-8000-000000000002', 'G4', 'd8140000-0000-4000-8000-000000000004'),
  ('e8140000-0000-4000-8000-000000000005', 'b8140000-0000-4000-8000-000000000002', 'G5', 'd8140000-0000-4000-8000-000000000005'),
  ('e8140000-0000-4000-8000-000000000006', 'b8140000-0000-4000-8000-000000000002', 'G6', 'd8140000-0000-4000-8000-000000000006'),
  ('e8140000-0000-4000-8000-000000000007', 'b8140000-0000-4000-8000-000000000003', 'G7', 'd8140000-0000-4000-8000-000000000007'),
  ('e8140000-0000-4000-8000-000000000008', 'b8140000-0000-4000-8000-000000000004', 'G8', 'd8140000-0000-4000-8000-000000000008'),
  ('e8140000-0000-4000-8000-000000000009', 'b8140000-0000-4000-8000-000000000005', 'G9', 'd8140000-0000-4000-8000-000000000009'),
  ('e8140000-0000-4000-8000-000000000010', 'b8140000-0000-4000-8000-000000000005', 'G10', 'd8140000-0000-4000-8000-000000000010'),
  ('e8140000-0000-4000-8000-000000000012', 'b8140000-0000-4000-8000-000000000005', 'G12', 'd8140000-0000-4000-8000-000000000012'),
  ('e8140000-0000-4000-8000-000000000013', 'b8140000-0000-4000-8000-000000000004', 'G13', 'd8140000-0000-4000-8000-000000000013'),
  ('e8140000-0000-4000-8000-000000000014', 'b8140000-0000-4000-8000-000000000004', 'G14', 'd8140000-0000-4000-8000-000000000014'),
  ('e8140000-0000-4000-8000-000000000016', 'b8140000-0000-4000-8000-000000000001', 'G16', NULL),
  ('e8140000-0000-4000-8000-000000000017', 'b8140000-0000-4000-8000-000000000003', 'G17', 'd8140000-0000-4000-8000-000000000017'),
  ('e8140000-0000-4000-8000-000000000018', 'b8140000-0000-4000-8000-000000000003', 'G18', 'd8140000-0000-4000-8000-000000000018'),
  ('e8140000-0000-4000-8000-000000000019', 'b8140000-0000-4000-8000-000000000002', 'G19', 'd8140000-0000-4000-8000-000000000019');

INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id) VALUES
  ('e8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101', 'f8140000-0000-4000-8000-000000000101'),
  ('e8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102', 'f8140000-0000-4000-8000-000000000102'),
  ('e8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000103', 'f8140000-0000-4000-8000-000000000103'),
  ('e8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000107', 'f8140000-0000-4000-8000-000000000107'),
  ('e8140000-0000-4000-8000-000000000004', 'c8140000-0000-4000-8000-000000000201', 'f8140000-0000-4000-8000-000000000201'),
  ('e8140000-0000-4000-8000-000000000004', 'c8140000-0000-4000-8000-000000000202', 'f8140000-0000-4000-8000-000000000202'),
  ('e8140000-0000-4000-8000-000000000006', 'c8140000-0000-4000-8000-000000000203', 'f8140000-0000-4000-8000-000000000203'),
  ('e8140000-0000-4000-8000-000000000006', 'c8140000-0000-4000-8000-000000000204', 'f8140000-0000-4000-8000-000000000204'),
  ('e8140000-0000-4000-8000-000000000007', 'c8140000-0000-4000-8000-000000000301', 'f8140000-0000-4000-8000-000000000301'),
  ('e8140000-0000-4000-8000-000000000007', 'c8140000-0000-4000-8000-000000000302', 'f8140000-0000-4000-8000-000000000302'),
  ('e8140000-0000-4000-8000-000000000008', 'c8140000-0000-4000-8000-000000000401', 'f8140000-0000-4000-8000-000000000401'),
  ('e8140000-0000-4000-8000-000000000008', 'c8140000-0000-4000-8000-000000000402', 'f8140000-0000-4000-8000-000000000402'),
  ('e8140000-0000-4000-8000-000000000009', 'c8140000-0000-4000-8000-000000000501', 'f8140000-0000-4000-8000-000000000501'),
  ('e8140000-0000-4000-8000-000000000009', 'c8140000-0000-4000-8000-000000000502', 'f8140000-0000-4000-8000-000000000502'),
  ('e8140000-0000-4000-8000-000000000010', 'c8140000-0000-4000-8000-000000000503', 'f8140000-0000-4000-8000-000000000503'),
  ('e8140000-0000-4000-8000-000000000019', 'c8140000-0000-4000-8000-000000000210', 'f8140000-0000-4000-8000-000000000210'),
  ('e8140000-0000-4000-8000-000000000017', 'c8140000-0000-4000-8000-000000000305', 'f8140000-0000-4000-8000-000000000305'),
  ('e8140000-0000-4000-8000-000000000017', 'c8140000-0000-4000-8000-000000000306', 'f8140000-0000-4000-8000-000000000306'),
  ('e8140000-0000-4000-8000-000000000018', 'c8140000-0000-4000-8000-000000000308', 'f8140000-0000-4000-8000-000000000308'),
  ('e8140000-0000-4000-8000-000000000018', 'c8140000-0000-4000-8000-000000000309', 'f8140000-0000-4000-8000-000000000309'),
  ('e8140000-0000-4000-8000-000000000018', 'c8140000-0000-4000-8000-000000000310', NULL),
  ('e8140000-0000-4000-8000-000000000014', 'c8140000-0000-4000-8000-000000000404', 'f8140000-0000-4000-8000-000000000404'),
  ('e8140000-0000-4000-8000-000000000014', 'c8140000-0000-4000-8000-000000000405', 'f8140000-0000-4000-8000-000000000405');

-- Tarjetas individuales (`rounds`) de los aprobados; P5, sin grupo, ya anotó en la suya (#828).
INSERT INTO public.rounds (id, tournament_id, player_id, round_number, status)
SELECT gen_random_uuid(), p.tournament_id, p.id, 1, 'in_progress' FROM public.players p
 WHERE p.id::text LIKE 'c8140000-%' AND p.status = 'approved';
INSERT INTO public.hole_scores (round_id, hole_number, par, gross_score)
SELECT r.id, 1, 4, 5 FROM public.rounds r WHERE r.player_id = 'c8140000-0000-4000-8000-000000000105';

-- ── Permisos ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, 'public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'EXECUTE')
       OR has_function_privilege(r, 'public.tarjeta_tiene_anotaciones(jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'FALLA: % puede ejecutar colocar_inscrito_en_grupo o su helper', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: service_role no puede ejecutar colocar_inscrito_en_grupo';
  END IF;
  RAISE NOTICE 'OK solo service_role ejecuta colocar_inscrito_en_grupo';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8140000-0000-4000-8000-000000000000","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.colocar_inscrito_en_grupo('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102',
      'e8140000-0000-4000-8000-000000000003', '{}', NULL, '[]', '{}', false);
    RAISE EXCEPTION 'FALLA: el organizador (authenticated) ejecutó la RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK authenticated recibe permission denied';
  END;
END $$;
RESET ROLE;

-- ── Individual (stroke play) ─────────────────────────────────────────────────────────────────────────────────
-- Conflicto optimista: el plan leyó a P1 con otro hándicap. No escribe.
DO $$
DECLARE r jsonb; e jsonb := pg_temp.esp('c8140000-0000-4000-8000-000000000101', 'e8140000-0000-4000-8000-000000000002');
        antes jsonb := pg_temp.foto();
BEGIN
  r := public.colocar_inscrito_en_grupo('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101',
         'e8140000-0000-4000-8000-000000000002', jsonb_set(e, '{inscrito,genero}', '"F"'), NULL, '[]', pg_temp.pol('stroke_play'), false);
  PERFORM pg_temp.debe_negar(r, 'conflicto', 'conflicto optimista (género: entra al hándicap de equipo)');
  e := jsonb_set(e, '{inscrito,handicap}', '11');
  r := public.colocar_inscrito_en_grupo('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101',
         'e8140000-0000-4000-8000-000000000002', e, NULL, '[]', pg_temp.pol('stroke_play'), false);
  PERFORM pg_temp.debe_negar(r, 'conflicto', 'conflicto optimista (hándicap)');
  -- Otro compañero en el grupo destino que el plan no vio.
  e := pg_temp.esp('c8140000-0000-4000-8000-000000000101', 'e8140000-0000-4000-8000-000000000002');
  e := jsonb_set(e, '{grupos}', (SELECT jsonb_agg(CASE WHEN g->>'group_id' = 'e8140000-0000-4000-8000-000000000002'
                                                        THEN jsonb_set(g, '{jugadores}', '[]') ELSE g END)
                                    FROM jsonb_array_elements(e->'grupos') g));
  r := public.colocar_inscrito_en_grupo('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101',
         'e8140000-0000-4000-8000-000000000002', e, NULL, '[]', pg_temp.pol('stroke_play'), false);
  PERFORM pg_temp.debe_negar(r, 'conflicto', 'conflicto optimista (grupo destino)');
  IF pg_temp.foto() IS DISTINCT FROM antes THEN
    RAISE EXCEPTION 'FALLA: un conflicto escribió';
  END IF;
  RAISE NOTICE 'OK un conflicto no escribe (players, grupos, filas y formatos idénticos)';
END $$;

-- Torneo no en juego y tarjeta cerrada: no escribe.
DO $$
BEGIN
  UPDATE public.tournaments SET status = 'closed' WHERE id = 'b8140000-0000-4000-8000-000000000001';
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102',
    'e8140000-0000-4000-8000-000000000002', 'stroke_play'), 'torneo-no-en-juego', 'torneo cerrado');
  UPDATE public.tournaments SET status = 'in_progress', total_rounds = 2 WHERE id = 'b8140000-0000-4000-8000-000000000001';
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102',
    'e8140000-0000-4000-8000-000000000002', 'stroke_play'), 'torneo-varias-rondas', 'torneo de dos rondas');
  UPDATE public.tournaments SET total_rounds = 1 WHERE id = 'b8140000-0000-4000-8000-000000000001';
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000108',
    'e8140000-0000-4000-8000-000000000016', 'stroke_play', '{"nombre": "P8"}'), 'grupo-sin-tarjeta', 'grupo sin tarjeta');
  BEGIN
    PERFORM pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000108',
      'e8140000-0000-4000-8000-000000000004', 'stroke_play', '{"nombre": "P8"}');
    RAISE EXCEPTION 'FALLA: colocó en un grupo de otro torneo';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%no es del torneo%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'OK grupo de otro torneo → RAISE';
  UPDATE public.rondas_libres SET estado = 'finalizada' WHERE id = 'd8140000-0000-4000-8000-000000000002';
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102',
    'e8140000-0000-4000-8000-000000000002', 'stroke_play'), 'tarjeta-cerrada', 'tarjeta destino cerrada');
  UPDATE public.rondas_libres SET estado = 'en_curso' WHERE id = 'd8140000-0000-4000-8000-000000000002';
END $$;

-- Mover con golpes, como service_role (la ruta): la fila viaja con su id, sus golpes y su orden de guardados.
-- El esperado y la política se arman antes como postgres (service_role no usa las ayudas de pg_temp).
SELECT set_config('prueba.esp', pg_temp.esp('c8140000-0000-4000-8000-000000000101', 'e8140000-0000-4000-8000-000000000002')::text, true),
       set_config('prueba.pol', pg_temp.pol('stroke_play')::text, true);
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.colocar_inscrito_en_grupo('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101',
         'e8140000-0000-4000-8000-000000000002', current_setting('prueba.esp')::jsonb, NULL, '[]',
         current_setting('prueba.pol')::jsonb, false);
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALLA mover con golpes: %', r; END IF;
  PERFORM pg_temp.debe_pasar(r, 'mover con golpes');
  IF r->>'operacion' <> 'mover' OR (r->>'jugador_ronda_id')::uuid <> 'f8140000-0000-4000-8000-000000000101' THEN
    RAISE EXCEPTION 'FALLA: mover devolvió %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f8140000-0000-4000-8000-000000000101'
                   AND ronda_id = 'd8140000-0000-4000-8000-000000000002' AND scores = '{"1": 4, "2": 5}'::jsonb)
     OR NOT EXISTS (SELECT 1 FROM public.tournament_group_players WHERE player_id = 'c8140000-0000-4000-8000-000000000101'
                      AND group_id = 'e8140000-0000-4000-8000-000000000002' AND jugador_ronda_id = 'f8140000-0000-4000-8000-000000000101')
     OR NOT EXISTS (SELECT 1 FROM public.ronda_libre_scores_orden WHERE jugador_id = 'f8140000-0000-4000-8000-000000000101' AND seq = 7) THEN
    RAISE EXCEPTION 'FALLA: mover perdió la fila, los golpes, el enlace o el orden de guardados';
  END IF;
  RAISE NOTICE 'OK mover con golpes conserva fila, golpes y enlace';
END $$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000103',
    'e8140000-0000-4000-8000-000000000002', 'stroke_play'), 'mismo-grupo', 'mismo grupo');
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000107',
    'e8140000-0000-4000-8000-000000000003', 'stroke_play'), 'retirado-no-se-mueve', 'D11 un WD no se mueve');
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000105',
    'e8140000-0000-4000-8000-000000000003', 'stroke_play', '{"nombre": "P5"}'), 'agregar-con-tarjeta-individual', '#828 golpes en su tarjeta individual');
END $$;

-- Agregar a un aprobado sin grupo a un grupo vacío con tarjeta.
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000104',
                       'e8140000-0000-4000-8000-000000000003', 'stroke_play', '{"nombre": "P4", "handicap": 16, "handicap_de_inscripcion": true}');
  PERFORM pg_temp.debe_pasar(r, 'agregar');
  IF NOT EXISTS (SELECT 1 FROM public.tournament_group_players gp JOIN public.ronda_libre_jugadores j ON j.id = gp.jugador_ronda_id
                  WHERE gp.player_id = 'c8140000-0000-4000-8000-000000000104' AND gp.group_id = 'e8140000-0000-4000-8000-000000000003'
                    AND j.ronda_id = 'd8140000-0000-4000-8000-000000000003' AND j.handicap = 16 AND j.handicap_de_inscripcion
                    AND j.scores = '{}'::jsonb) THEN
    RAISE EXCEPTION 'FALLA: agregar no dejó fila y enlace';
  END IF;
  RAISE NOTICE 'OK agregar crea la fila de tarjeta y el enlace';
END $$;

-- D12: colocar a uno de la lista de espera lo aprueba, respetando el cupo como un alta.
DO $$
DECLARE r jsonb;
BEGIN
  UPDATE public.tournaments SET max_players = 6 WHERE id = 'b8140000-0000-4000-8000-000000000001';
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000106',
    'e8140000-0000-4000-8000-000000000003', 'stroke_play', '{"nombre": "P6"}'), 'cupo-lleno', 'D12 con el cupo lleno');
  UPDATE public.tournaments SET max_players = 7 WHERE id = 'b8140000-0000-4000-8000-000000000001';
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000106',
                       'e8140000-0000-4000-8000-000000000003', 'stroke_play', '{"nombre": "P6"}');
  PERFORM pg_temp.debe_pasar(r, 'D12 aprobar al colocar');
  IF NOT (r->>'aprobado')::boolean
     OR NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c8140000-0000-4000-8000-000000000106' AND status = 'approved')
     OR NOT EXISTS (SELECT 1 FROM public.rounds WHERE player_id = 'c8140000-0000-4000-8000-000000000106' AND round_number = 1)
     OR NOT EXISTS (SELECT 1 FROM public.tournament_group_players WHERE player_id = 'c8140000-0000-4000-8000-000000000106'
                      AND group_id = 'e8140000-0000-4000-8000-000000000003' AND jugador_ronda_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FALLA: D12 no aprobó, no creó su tarjeta individual o no lo enlazó: %', r;
  END IF;
  RAISE NOTICE 'OK D12 aprueba, crea su tarjeta individual y lo coloca';
END $$;

-- D1: borrar con golpes se niega (ofrece retirar); sin golpes elimina fila, enlace e inscripción; un WD sin golpes también.
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000103', NULL, 'stroke_play');
  PERFORM pg_temp.debe_negar(r, 'borrar-con-golpes', 'D1 borrar con golpes');
  IF NOT (r->>'ofrece_retirar')::boolean THEN RAISE EXCEPTION 'FALLA: borrar con golpes no ofrece retirar'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c8140000-0000-4000-8000-000000000103') THEN
    RAISE EXCEPTION 'FALLA: borrar con golpes borró'; END IF;

  PERFORM pg_temp.debe_pasar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000102', NULL, 'stroke_play'), 'borrar sin golpes');
  PERFORM pg_temp.debe_pasar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000107', NULL, 'stroke_play'), 'borrar WD sin golpes');
  IF EXISTS (SELECT 1 FROM public.players WHERE id IN ('c8140000-0000-4000-8000-000000000102', 'c8140000-0000-4000-8000-000000000107'))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id IN ('f8140000-0000-4000-8000-000000000102', 'f8140000-0000-4000-8000-000000000107')) THEN
    RAISE EXCEPTION 'FALLA: borrar sin golpes dejó la inscripción o la fila';
  END IF;
  RAISE NOTICE 'OK borrar sin golpes elimina; con golpes se niega y ofrece WD';
  PERFORM pg_temp.debe_pasar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000109', NULL, 'stroke_play'), 'borrar sin aprobar');
  IF EXISTS (SELECT 1 FROM public.players WHERE id = 'c8140000-0000-4000-8000-000000000109') THEN
    RAISE EXCEPTION 'FALLA: borrar a un sin aprobar no lo borró';
  END IF;
  RAISE NOTICE 'OK borrar a un sin aprobar (sin grupo) elimina la inscripción';
END $$;

-- Timba en la tarjeta: falla cerrado.
DO $$
BEGIN
  INSERT INTO public.ronda_libre_juego_orden (ronda_id, clave, dispositivo, seq)
  VALUES ('d8140000-0000-4000-8000-000000000003', 'x', gen_random_uuid(), 1);
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000001', 'c8140000-0000-4000-8000-000000000101',
    'e8140000-0000-4000-8000-000000000003', 'stroke_play'), 'tarjeta-con-timba', 'tarjeta con timba');
  DELETE FROM public.ronda_libre_juego_orden WHERE ronda_id = 'd8140000-0000-4000-8000-000000000003';
END $$;

-- ── Scramble: equipo creado, equipo borrado y D3 ─────────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  -- S1 de G4 a G5 (tarjeta sin equipo): se crea el equipo; G4 queda con S2, incompleto y sin golpes (D7).
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000201',
         'e8140000-0000-4000-8000-000000000005', 'scramble', NULL,
         '[{"group_id": "e8140000-0000-4000-8000-000000000004", "handicap_equipo": null, "handicap_equipo_juego": null},
           {"group_id": "e8140000-0000-4000-8000-000000000005", "handicap_equipo": null, "handicap_equipo_juego": null}]');
  PERFORM pg_temp.debe_pasar(r, 'scramble mover a grupo sin equipo');
  IF NOT (r->>'equipo_creado')::boolean THEN RAISE EXCEPTION 'FALLA: no se creó el equipo destino: %', r; END IF;
  -- Sin hándicap con 2 que compiten: se niega (RAISE).
  BEGIN
    PERFORM pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000202',
         'e8140000-0000-4000-8000-000000000005', 'scramble', NULL,
         '[{"group_id": "e8140000-0000-4000-8000-000000000005", "handicap_equipo": null, "handicap_equipo_juego": null}]');
    RAISE EXCEPTION 'FALLA: armó un equipo completo sin hándicap';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%hándicap de equipo inválido%' THEN RAISE; END IF;
  END;
  -- S2 también: G4 queda vacío y su equipo se borra; G5 queda con 2 y su hándicap.
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000202',
         'e8140000-0000-4000-8000-000000000005', 'scramble', NULL,
         '[{"group_id": "e8140000-0000-4000-8000-000000000005", "handicap_equipo": 2.5, "handicap_equipo_juego": 3}]');
  PERFORM pg_temp.debe_pasar(r, 'scramble vaciar un equipo');
  IF NOT (r->>'equipo_borrado')::boolean
     OR EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = 'a8140000-0000-4000-8000-000000000e04')
     OR (SELECT count(*) FROM public.ronda_equipo_jugadores rej JOIN public.ronda_equipos re ON re.id = rej.equipo_id
          WHERE re.ronda_id = 'd8140000-0000-4000-8000-000000000005' AND re.handicap_equipo = 2.5 AND re.handicap_equipo_juego = 3) <> 2 THEN
    RAISE EXCEPTION 'FALLA: equipo borrado/creado mal: %', r;
  END IF;
  RAISE NOTICE 'OK scramble: equipo creado en el destino, equipo vacío borrado, hándicap escrito';

  -- D3: G6 ya tiene golpes; sacar a S3 lo dejaría con 1 (< 2). Borrar a S4: los golpes son del equipo (D1).
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000203',
    'e8140000-0000-4000-8000-000000000004', 'scramble', NULL, '[]'), 'equipo-con-golpes-incompleto', 'D3 equipo con golpes bajo el mínimo');
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000204', NULL, 'scramble');
  PERFORM pg_temp.debe_negar(r, 'borrar-con-golpes', 'D1 bola compartida: golpes del equipo');
  -- G19 tiene golpes y una sola fila: sacarla deja golpes de equipo sin nadie.
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000002', 'c8140000-0000-4000-8000-000000000210',
    'e8140000-0000-4000-8000-000000000005', 'scramble', NULL, '[]'), 'equipo-con-golpes-sin-miembros', 'equipo con golpes sin miembros');
END $$;

-- ── Foursome: D13 ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000003', 'c8140000-0000-4000-8000-000000000303',
         'e8140000-0000-4000-8000-000000000007', 'foursome', '{"nombre": "F3", "handicap": 14, "handicap_de_inscripcion": true}',
         '[{"group_id": "e8140000-0000-4000-8000-000000000007", "handicap_equipo": 6, "handicap_equipo_juego": 6}]');
  PERFORM pg_temp.debe_pasar(r, 'D13 completar pareja con WD');
  IF (r->>'retirados_quitados')::integer <> 1
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f8140000-0000-4000-8000-000000000302')
     OR EXISTS (SELECT 1 FROM public.tournament_group_players WHERE player_id = 'c8140000-0000-4000-8000-000000000302')
     OR NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c8140000-0000-4000-8000-000000000302' AND status = 'withdrawn')
     OR (SELECT count(*) FROM public.ronda_equipo_jugadores WHERE equipo_id = 'a8140000-0000-4000-8000-000000000e07') <> 2 THEN
    RAISE EXCEPTION 'FALLA: D13 no sacó al WD de la pareja: %', r;
  END IF;
  RAISE NOTICE 'OK D13 la pareja completa suelta su fila WD (la inscripción queda)';

  -- G7 ya es pareja completa (F1, F3).
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000003', 'c8140000-0000-4000-8000-000000000304',
    'e8140000-0000-4000-8000-000000000007', 'foursome', '{"nombre": "F4"}'), 'equipo-lleno', 'foursome pareja llena');
  -- G17 con golpes y un WD con fila: la pareja está al pie, completarla no la salva.
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000003', 'c8140000-0000-4000-8000-000000000307',
    'e8140000-0000-4000-8000-000000000017', 'foursome', '{"nombre": "F7"}'), 'equipo-al-pie', 'foursome al pie con golpes');

  -- D13 con dos fuera: F9 (WD con fila) y F10 (DQ sin fila). Ambos salen del grupo; solo F9 tenía fila.
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000003', 'c8140000-0000-4000-8000-000000000311',
         'e8140000-0000-4000-8000-000000000018', 'foursome', '{"nombre": "F11"}',
         '[{"group_id": "e8140000-0000-4000-8000-000000000018", "handicap_equipo": 7, "handicap_equipo_juego": 7}]');
  PERFORM pg_temp.debe_pasar(r, 'D13 con dos WD/DQ');
  IF (r->>'retirados_quitados')::integer <> 2
     OR EXISTS (SELECT 1 FROM public.tournament_group_players WHERE player_id IN ('c8140000-0000-4000-8000-000000000309', 'c8140000-0000-4000-8000-000000000310'))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f8140000-0000-4000-8000-000000000309')
     OR (SELECT count(*) FROM public.players WHERE id IN ('c8140000-0000-4000-8000-000000000309', 'c8140000-0000-4000-8000-000000000310')) <> 2
     OR (SELECT count(*) FROM public.ronda_equipo_jugadores WHERE equipo_id = 'a8140000-0000-4000-8000-000000000e18') <> 2 THEN
    RAISE EXCEPTION 'FALLA: D13 con dos WD/DQ: %', r;
  END IF;
  RAISE NOTICE 'OK D13 suelta a todos los WD/DQ, con y sin fila';
END $$;

-- ── Mejor bola: DQ con un hoyo que nadie cubre ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000004', 'c8140000-0000-4000-8000-000000000403',
    'e8140000-0000-4000-8000-000000000008', 'best_ball', '{"nombre": "B3"}',
    '[{"group_id": "e8140000-0000-4000-8000-000000000008", "handicap_equipo": null, "handicap_equipo_juego": null}]'),
    'equipo-al-pie', 'mejor bola DQ con hoyo sin cubrir');
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000004', 'c8140000-0000-4000-8000-000000000402',
    'e8140000-0000-4000-8000-000000000013', 'best_ball', NULL, '[]'), 'mejor-bola-con-golpes', 'D2 mejor bola con golpes');
  -- G14: el DQ anotó el hoyo 1 y B5 también: cubierto, el equipo no está al pie y B6 entra.
  PERFORM pg_temp.debe_pasar(pg_temp.colocar('b8140000-0000-4000-8000-000000000004', 'c8140000-0000-4000-8000-000000000406',
    'e8140000-0000-4000-8000-000000000014', 'best_ball', '{"nombre": "B6"}',
    '[{"group_id": "e8140000-0000-4000-8000-000000000014", "handicap_equipo": null, "handicap_equipo_juego": null}]'),
    'mejor bola DQ con el hoyo cubierto');
  RAISE NOTICE 'OK mejor bola: DQ con el hoyo cubierto no deja al equipo al pie';
END $$;

-- ── Match play: D10, D8 y formato de la tarjeta ──────────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000504',
    'e8140000-0000-4000-8000-000000000009', 'match_play', '{"nombre": "M4"}'), 'match-play-grupo-lleno', 'D10 tercero en un match');
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000504',
         'e8140000-0000-4000-8000-000000000010', 'match_play', '{"nombre": "M4"}');
  PERFORM pg_temp.debe_pasar(r, 'match play completar un par');
  IF NOT EXISTS (SELECT 1 FROM public.rondas_libres WHERE id = 'd8140000-0000-4000-8000-000000000010' AND formato_juego = 'match_play') THEN
    RAISE EXCEPTION 'FALLA: la tarjeta del nuevo par no pasó a match_play';
  END IF;
  -- El rival concedió un hoyo: el match ya empezó y M2 (sin golpes) no se elimina.
  UPDATE public.ronda_libre_jugadores SET scores = '{"1": -1}' WHERE id = 'f8140000-0000-4000-8000-000000000501';
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000502', NULL, 'match_play');
  PERFORM pg_temp.debe_negar(r, 'borrar-match-en-juego', 'D8 match en juego');
  IF NOT (r->>'ofrece_retirar')::boolean THEN RAISE EXCEPTION 'FALLA: D8 no ofrece retirar'; END IF;
  -- D6: el match de G9 ya empezó; M1 no se mueve a otro grupo.
  PERFORM pg_temp.debe_negar(pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000501',
    'e8140000-0000-4000-8000-000000000012', 'match_play'), 'match-play-con-golpes', 'D6 match play con golpes');
  -- Sacar a M4 del par de G10 sin golpes: G10 vuelve a stroke play (1 jugador) y G12 queda en stroke play.
  r := pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000504',
         'e8140000-0000-4000-8000-000000000012', 'match_play');
  PERFORM pg_temp.debe_pasar(r, 'match play deshacer un par');
  IF (SELECT formato_juego FROM public.rondas_libres WHERE id = 'd8140000-0000-4000-8000-000000000010') <> 'stroke_play'
     OR (SELECT formato_juego FROM public.rondas_libres WHERE id = 'd8140000-0000-4000-8000-000000000012') <> 'stroke_play' THEN
    RAISE EXCEPTION 'FALLA: la RPC no recalculó el formato al deshacer el par';
  END IF;
  -- match_pairings en la tarjeta: los torneos no los crean; falla cerrado.
  INSERT INTO public.match_pairings (ronda_id, jugador_a_id, jugador_b_id)
  SELECT 'd8140000-0000-4000-8000-000000000012', gp.jugador_ronda_id, 'f8140000-0000-4000-8000-000000000503'
    FROM public.tournament_group_players gp WHERE gp.player_id = 'c8140000-0000-4000-8000-000000000504';
  BEGIN
    PERFORM pg_temp.colocar('b8140000-0000-4000-8000-000000000005', 'c8140000-0000-4000-8000-000000000504',
                            'e8140000-0000-4000-8000-000000000010', 'match_play');
    RAISE EXCEPTION 'FALLA: tocó una tarjeta con match_pairings';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%match_pairings%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'OK match play: el formato lo decide la RPC (par → match, otro tamaño → stroke), D10, D6, D8 y match_pairings';
END $$;

-- ── Los triggers grupos_fijos_* siguen activos y cortan al cliente ───────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
       AND tgname IN ('grupos_fijos_jugadores_de_grupo', 'grupos_fijos_grupo', 'grupos_fijos_inscrito')) <> 3 THEN
    RAISE EXCEPTION 'FALLA: falta o está desactivado algún trigger grupos_fijos_*';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8140000-0000-4000-8000-000000000000","role":"authenticated"}';
DO $$
DECLARE bloqueado boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.tournament_group_players WHERE player_id = 'c8140000-0000-4000-8000-000000000101';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'El torneo ya empezó%' THEN RAISE; END IF;
    bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: con el torneo en juego el cliente sacó a un jugador de su grupo'; END IF;
  RAISE NOTICE 'OK los triggers grupos_fijos_* siguen cortando al cliente';
END $$;

RESET ROLE;
ROLLBACK;
