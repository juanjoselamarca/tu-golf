-- Pruebas SQL de 20261123100000_grupo_en_juego (#814 · PR4), contra el Postgres desechable del check `esquema`
-- (scripts/ci/esquema.mjs) con todas las migraciones aplicadas.
--
-- Qué exige:
--   · permisos: solo service_role ejecuta crear_grupo_en_juego y borrar_grupo_en_juego;
--   · crear: grupo nuevo con su tarjeta en curso, vacía y sin equipo, al final del orden; un grupo vacío sin tarjeta
--     recibe la suya; nombre repetido, tarjeta distinta, código repetido, grupo con tarjeta, grupo con inscritos,
--     torneo no en juego y de varias rondas: no escriben;
--   · el grupo nuevo queda listo para `colocar_inscrito_en_grupo` (individual, y scramble: crea el equipo);
--   · borrar: vacío (con y sin tarjeta) borra grupo y tarjeta; con jugadores, con un WD sin fila, con golpes de
--     equipo, tarjeta cerrada, grupo de otro torneo y torneo no en juego: no escriben;
--   · los triggers grupos_fijos_* siguen activos para el cliente.
-- La concurrencia no se prueba aquí: una sola sesión no la ejercita. Cada caso es un DO que lanza una excepción si
-- el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Ayudas (pg_temp, mueren con la sesión) ───────────────────────────────────────────────────────────────────
-- La tarjeta que arma la app (`tarjetaDeGrupoDeTorneo`), con los valores de las tarjetas de prueba.
CREATE FUNCTION pg_temp.tarjeta(codigo text, formato text DEFAULT 'stroke_play', holes integer DEFAULT 18) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('codigo', codigo, 'creador_id', 'a8144000-0000-4000-8000-000000000000', 'course_id', NULL,
                            'course_name', 'Cancha', 'tees', 'blanco', 'holes', holes, 'fecha', current_date,
                            'formato_juego', formato, 'modo_juego', 'gross', 'hcp_pct', 100);
$$;

-- Foto de lo que las RPC escriben, para comprobar que un "no" no escribió nada.
CREATE FUNCTION pg_temp.foto() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'tg', (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM public.tournament_groups g
            WHERE g.tournament_id::text LIKE 'b8144000-%'),
    'rl', (SELECT jsonb_agg(rl.id ORDER BY rl.id) FROM public.rondas_libres rl
            WHERE rl.creador_id = 'a8144000-0000-4000-8000-000000000000'),
    're', (SELECT jsonb_agg(re.id ORDER BY re.id) FROM public.ronda_equipos re
            JOIN public.rondas_libres rl ON rl.id = re.ronda_id
           WHERE rl.creador_id = 'a8144000-0000-4000-8000-000000000000'));
$$;

-- Falla si r no es {"ok": false, "motivo": m} o si la base cambió.
CREATE FUNCTION pg_temp.debe_negar(r jsonb, m text, antes jsonb, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (r->>'ok')::boolean OR r->>'motivo' IS DISTINCT FROM m THEN
    RAISE EXCEPTION 'FALLA %: esperaba motivo %, llegó %', caso, m, r;
  END IF;
  IF pg_temp.foto() IS DISTINCT FROM antes THEN
    RAISE EXCEPTION 'FALLA %: negó (%) pero escribió', caso, m;
  END IF;
  RAISE NOTICE 'OK % → %', caso, m;
END $$;

-- La política de `colocar_inscrito_en_grupo` (la arma la app desde las fuentes de TS).
CREATE FUNCTION pg_temp.pol(f text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'formato', f, 'equipo', f IN ('best_ball', 'scramble', 'foursome'), 'bola_compartida', f IN ('scramble', 'foursome'),
    'match_play', f = 'match_play', 'al_pie_con_retirado', f = 'foursome',
    'jugadores_por_equipo', CASE WHEN f IN ('best_ball', 'scramble') THEN '{"min": 2, "max": 4}'::jsonb
                                 WHEN f = 'foursome' THEN '{"min": 2, "max": 2}'::jsonb ELSE 'null'::jsonb END,
    'jugadores_por_match', 2);
$$;

-- El esperado de agregar a un inscrito sin grupo al grupo `dest` (vacío).
CREATE FUNCTION pg_temp.esp_agregar(p_p uuid, dest uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'inscrito', (SELECT jsonb_build_object('status', p.status, 'handicap', p.handicap_at_registration, 'tee_id', p.tee_id,
                                           'genero', p.genero, 'category_id', p.category_id, 'grupo', NULL)
                   FROM public.players p WHERE p.id = p_p),
    'grupos', (SELECT jsonb_agg(jsonb_build_object('group_id', g.id, 'ronda_libre_id', g.ronda_libre_id, 'jugadores', '[]'::jsonb))
                 FROM public.tournament_groups g WHERE g.id = dest));
$$;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES ('a8144000-0000-4000-8000-000000000000', 'organizador-814-pr4@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status) VALUES
  ('b8144000-0000-4000-8000-000000000001', 'Stroke', 'ge-stroke', 'a8144000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8144000-0000-4000-8000-000000000002', 'Scramble', 'ge-scramble', 'a8144000-0000-4000-8000-000000000000', current_date, 'in_progress'),
  ('b8144000-0000-4000-8000-000000000003', 'Abierto', 'ge-abierto', 'a8144000-0000-4000-8000-000000000000', current_date, 'open'),
  ('b8144000-0000-4000-8000-000000000005', 'Match', 'ge-match', 'a8144000-0000-4000-8000-000000000000', current_date, 'in_progress');

INSERT INTO public.players (id, tournament_id, player_name, handicap_at_registration, status, pending_user_id) VALUES
  ('c8144000-0000-4000-8000-000000000101', 'b8144000-0000-4000-8000-000000000001', 'P1', 10, 'approved', gen_random_uuid()),
  ('c8144000-0000-4000-8000-000000000102', 'b8144000-0000-4000-8000-000000000001', 'P2', 12, 'approved', gen_random_uuid()),
  ('c8144000-0000-4000-8000-000000000103', 'b8144000-0000-4000-8000-000000000001', 'P3', 14, 'withdrawn', gen_random_uuid()),
  ('c8144000-0000-4000-8000-000000000104', 'b8144000-0000-4000-8000-000000000001', 'P4', 16, 'pending', gen_random_uuid()),
  ('c8144000-0000-4000-8000-000000000201', 'b8144000-0000-4000-8000-000000000002', 'S1', 10, 'approved', gen_random_uuid());

-- Tarjetas de grupo (d8144 + nº de grupo) y grupos (e8144 + nº).
INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d8144000-0000-4000-8000-000000000001', 'GE8141', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8144000-0000-4000-8000-000000000004', 'GE8144', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8144000-0000-4000-8000-000000000005', 'GE8145', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'stroke_play', 18, 'finalizada'),
  ('d8144000-0000-4000-8000-000000000011', 'GE8151', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso'),
  ('d8144000-0000-4000-8000-000000000012', 'GE8152', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'scramble', 18, 'en_curso'),
  ('d8144000-0000-4000-8000-000000000021', 'GE8161', 'Cancha', current_date, 'a8144000-0000-4000-8000-000000000000', 'match_play', 18, 'en_curso');

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, handicap, scores) VALUES
  ('f8144000-0000-4000-8000-000000000101', 'd8144000-0000-4000-8000-000000000001', 'P1', 10, '{"1": 4}');

-- Scramble: el equipo del grupo 11 con golpes y sin filas (corrupto, pero así se prueba el motivo); el 12, vacío.
INSERT INTO public.ronda_equipos (id, ronda_id, nombre, scores) VALUES
  ('91440000-0000-4000-8000-000000000011', 'd8144000-0000-4000-8000-000000000011', 'Equipo 1', '{"1": 4}'),
  ('91440000-0000-4000-8000-000000000012', 'd8144000-0000-4000-8000-000000000012', 'Equipo 2', '{}');

INSERT INTO public.tournament_groups (id, tournament_id, name, sort_order, ronda_libre_id) VALUES
  -- Stroke: G1 con P1 (fila con golpes); G2 vacío sin tarjeta (el inicio no arma grupos vacíos); G3 con un WD sin
  -- fila y sin tarjeta; G4 vacío con tarjeta; G5 vacío con la tarjeta cerrada; G6 con un pendiente, sin tarjeta.
  ('e8144000-0000-4000-8000-000000000001', 'b8144000-0000-4000-8000-000000000001', 'Grupo 1', 0, 'd8144000-0000-4000-8000-000000000001'),
  ('e8144000-0000-4000-8000-000000000002', 'b8144000-0000-4000-8000-000000000001', 'Grupo 2', 1, NULL),
  ('e8144000-0000-4000-8000-000000000003', 'b8144000-0000-4000-8000-000000000001', 'Grupo 3', 2, NULL),
  ('e8144000-0000-4000-8000-000000000004', 'b8144000-0000-4000-8000-000000000001', 'Grupo 4', 3, 'd8144000-0000-4000-8000-000000000004'),
  ('e8144000-0000-4000-8000-000000000005', 'b8144000-0000-4000-8000-000000000001', 'Grupo 5', 4, 'd8144000-0000-4000-8000-000000000005'),
  ('e8144000-0000-4000-8000-000000000006', 'b8144000-0000-4000-8000-000000000001', 'Grupo 6', 7, NULL),
  ('e8144000-0000-4000-8000-000000000011', 'b8144000-0000-4000-8000-000000000002', 'Equipo 1', 0, 'd8144000-0000-4000-8000-000000000011'),
  ('e8144000-0000-4000-8000-000000000012', 'b8144000-0000-4000-8000-000000000002', 'Equipo 2', 1, 'd8144000-0000-4000-8000-000000000012'),
  ('e8144000-0000-4000-8000-000000000031', 'b8144000-0000-4000-8000-000000000003', 'Grupo 1', 0, NULL),
  ('e8144000-0000-4000-8000-000000000021', 'b8144000-0000-4000-8000-000000000005', 'Grupo 1', 0, 'd8144000-0000-4000-8000-000000000021');

INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id) VALUES
  ('e8144000-0000-4000-8000-000000000001', 'c8144000-0000-4000-8000-000000000101', 'f8144000-0000-4000-8000-000000000101'),
  ('e8144000-0000-4000-8000-000000000003', 'c8144000-0000-4000-8000-000000000103', NULL),
  ('e8144000-0000-4000-8000-000000000006', 'c8144000-0000-4000-8000-000000000104', NULL);

-- ── Permisos ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.crear_grupo_en_juego(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crear_grupo_en_juego(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.borrar_grupo_en_juego(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.borrar_grupo_en_juego(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: el cliente puede ejecutar una RPC de grupo en juego';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_grupo_en_juego(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.borrar_grupo_en_juego(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: service_role no puede ejecutar las RPC de grupo en juego';
  END IF;
  RAISE NOTICE 'OK solo service_role ejecuta las RPC de grupo en juego';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8144000-0000-4000-8000-000000000000","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'FALLA: el organizador (authenticated) ejecutó borrar_grupo_en_juego';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'X', '{}');
    RAISE EXCEPTION 'FALLA: el organizador (authenticated) ejecutó crear_grupo_en_juego';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'OK authenticated recibe permission denied';
END $$;
RESET ROLE;

-- ── Crear, como service_role (la ruta) ───────────────────────────────────────────────────────────────────────
SELECT set_config('prueba.tarjeta', pg_temp.tarjeta('GEN001')::text, true);
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, '  Grupo 7 ',
                                   current_setting('prueba.tarjeta')::jsonb);
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR r->>'nombre' <> 'Grupo 7' THEN
    RAISE EXCEPTION 'FALLA crear grupo nuevo: %', r;
  END IF;
  PERFORM set_config('prueba.nuevo', r->>'group_id', true);
  IF NOT EXISTS (SELECT 1 FROM public.tournament_groups g JOIN public.rondas_libres rl ON rl.id = g.ronda_libre_id
                  WHERE g.id = (r->>'group_id')::uuid AND g.tournament_id = 'b8144000-0000-4000-8000-000000000001'
                    AND g.name = 'Grupo 7' AND g.sort_order = 8 AND rl.id = (r->>'ronda_libre_id')::uuid
                    AND rl.codigo = 'GEN001' AND rl.estado = 'en_curso' AND rl.formato_juego = 'stroke_play'
                    AND rl.holes = 18 AND rl.modo_juego = 'gross' AND rl.hcp_pct = 100) THEN
    RAISE EXCEPTION 'FALLA: el grupo nuevo no quedó con su tarjeta en curso, al final del orden';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = (r->>'ronda_libre_id')::uuid)
     OR EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = (r->>'ronda_libre_id')::uuid) THEN
    RAISE EXCEPTION 'FALLA: la tarjeta nueva no quedó vacía';
  END IF;
  RAISE NOTICE 'OK crear grupo nuevo con su tarjeta vacía';
END $$;
RESET ROLE;

DO $$
DECLARE antes jsonb := pg_temp.foto();
BEGIN
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'grupo 7',
                               pg_temp.tarjeta('GEN002')), 'nombre-repetido', antes, 'nombre repetido (sin mayúsculas)');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'Grupo 8',
                               pg_temp.tarjeta('GEN002', 'stroke_play', 9)), 'tarjeta-distinta', antes, 'tarjeta que no calza');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'Grupo 8',
                               pg_temp.tarjeta('GEN002', 'scramble')), 'tarjeta-distinta', antes, 'formato que no calza');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'Grupo 8',
                               pg_temp.tarjeta('GE8141')), 'codigo-repetido', antes, 'código repetido');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001',
                               'e8144000-0000-4000-8000-000000000004', NULL, pg_temp.tarjeta('GEN002')),
                             'grupo-con-tarjeta', antes, 'grupo que ya tiene tarjeta');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001',
                               'e8144000-0000-4000-8000-000000000006', NULL, pg_temp.tarjeta('GEN002')),
                             'grupo-con-jugadores', antes, 'grupo sin tarjeta con un pendiente');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001',
                               'e8144000-0000-4000-8000-000000000031', NULL, pg_temp.tarjeta('GEN002')),
                             'grupo-no-existe', antes, 'grupo de otro torneo');
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000003', NULL, 'Grupo 2',
                               pg_temp.tarjeta('GEN002')), 'torneo-no-en-juego', antes, 'crear con el torneo abierto');
  UPDATE public.tournaments SET total_rounds = 2 WHERE id = 'b8144000-0000-4000-8000-000000000001';
  antes := pg_temp.foto();
  PERFORM pg_temp.debe_negar(public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', NULL, 'Grupo 8',
                               pg_temp.tarjeta('GEN002')), 'torneo-varias-rondas', antes, 'crear en varias rondas');
  UPDATE public.tournaments SET total_rounds = 1 WHERE id = 'b8144000-0000-4000-8000-000000000001';
  -- Forma: grupo nuevo sin nombre, o existente con nombre → RAISE.
  BEGIN
    PERFORM public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000002',
                                        'Otro', pg_temp.tarjeta('GEN002'));
    RAISE EXCEPTION 'FALLA: aceptó nombre para un grupo existente';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'crear_grupo_en_juego:%' THEN RAISE; END IF;
  END;
END $$;

-- Un grupo vacío que el inicio no armó recibe su tarjeta (conserva nombre y orden).
DO $$
DECLARE r jsonb;
BEGIN
  r := public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000002', NULL,
                                   pg_temp.tarjeta('GEN003'));
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR (r->>'group_id')::uuid <> 'e8144000-0000-4000-8000-000000000002'
     OR r->>'nombre' <> 'Grupo 2'
     OR NOT EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.id = 'e8144000-0000-4000-8000-000000000002'
                     AND g.sort_order = 1 AND g.ronda_libre_id = (r->>'ronda_libre_id')::uuid) THEN
    RAISE EXCEPTION 'FALLA armar tarjeta de un grupo vacío: %', r;
  END IF;
  RAISE NOTICE 'OK un grupo vacío sin tarjeta recibe la suya';
END $$;

-- El grupo nuevo queda listo para colocar: agregar a P2 (aprobado, sin grupo) a "Grupo 7".
DO $$
DECLARE r jsonb;
BEGIN
  r := public.colocar_inscrito_en_grupo('b8144000-0000-4000-8000-000000000001', 'c8144000-0000-4000-8000-000000000102',
         current_setting('prueba.nuevo')::uuid,
         pg_temp.esp_agregar('c8144000-0000-4000-8000-000000000102', current_setting('prueba.nuevo')::uuid),
         '{"nombre": "P2", "handicap": 12, "handicap_de_inscripcion": true}', '[]', pg_temp.pol('stroke_play'), false);
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR r->>'operacion' <> 'agregar' THEN
    RAISE EXCEPTION 'FALLA colocar en el grupo nuevo: %', r;
  END IF;
  RAISE NOTICE 'OK colocar_inscrito_en_grupo agrega en el grupo nuevo';
END $$;

-- Scramble: el grupo nuevo nace sin equipo y colocar lo crea con el nombre del grupo.
DO $$
DECLARE r jsonb; g uuid;
BEGIN
  r := public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000002', NULL, 'Equipo 3', pg_temp.tarjeta('GEN004', 'scramble'));
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALLA crear en scramble: %', r; END IF;
  g := (r->>'group_id')::uuid;
  r := public.colocar_inscrito_en_grupo('b8144000-0000-4000-8000-000000000002', 'c8144000-0000-4000-8000-000000000201', g,
         pg_temp.esp_agregar('c8144000-0000-4000-8000-000000000201', g),
         '{"nombre": "S1", "handicap": 10, "handicap_de_inscripcion": true}',
         jsonb_build_array(jsonb_build_object('group_id', g, 'handicap_equipo', NULL, 'handicap_equipo_juego', NULL)),
         pg_temp.pol('scramble'), false);
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR (r->>'equipo_creado')::boolean IS DISTINCT FROM true
     OR NOT EXISTS (SELECT 1 FROM public.ronda_equipos re JOIN public.tournament_groups tg ON tg.ronda_libre_id = re.ronda_id
                     WHERE tg.id = g AND re.nombre = 'Equipo 3') THEN
    RAISE EXCEPTION 'FALLA colocar en el equipo nuevo: %', r;
  END IF;
  RAISE NOTICE 'OK scramble: el grupo nuevo recibe su equipo al colocar';
END $$;

-- Match play: la tarjeta vacía nace en stroke play (`formatoDeLaTarjetaDelGrupo` con 0) y calza con las de match.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.crear_grupo_en_juego('b8144000-0000-4000-8000-000000000005', NULL, 'Grupo 2', pg_temp.tarjeta('GEN005', 'stroke_play'));
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALLA crear en match play: %', r; END IF;
  RAISE NOTICE 'OK match play: tarjeta vacía en stroke play';
END $$;

-- ── Borrar ───────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE antes jsonb := pg_temp.foto();
BEGIN
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000001'),
                             'grupo-con-jugadores', antes, 'borrar con un jugador con golpes');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', current_setting('prueba.nuevo')::uuid),
                             'grupo-con-jugadores', antes, 'borrar con un jugador recién colocado');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000003'),
                             'grupo-con-jugadores', antes, 'borrar con un WD sin fila');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000002', 'e8144000-0000-4000-8000-000000000011'),
                             'grupo-con-golpes', antes, 'borrar con golpes de equipo');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000005'),
                             'tarjeta-cerrada', antes, 'borrar con la tarjeta cerrada');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000031'),
                             'grupo-no-existe', antes, 'borrar un grupo de otro torneo');
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000003', 'e8144000-0000-4000-8000-000000000031'),
                             'torneo-no-en-juego', antes, 'borrar con el torneo abierto');
  UPDATE public.tournaments SET total_rounds = 2 WHERE id = 'b8144000-0000-4000-8000-000000000001';
  antes := pg_temp.foto();
  PERFORM pg_temp.debe_negar(public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000004'),
                             'torneo-varias-rondas', antes, 'borrar en varias rondas');
  UPDATE public.tournaments SET total_rounds = 1 WHERE id = 'b8144000-0000-4000-8000-000000000001';
END $$;

-- Vacío con tarjeta (como service_role): se van el grupo y la tarjeta. Scramble: también su equipo vacío.
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000004');
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR (r->>'ronda_libre_id')::uuid <> 'd8144000-0000-4000-8000-000000000004'
     OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE id = 'e8144000-0000-4000-8000-000000000004')
     OR EXISTS (SELECT 1 FROM public.rondas_libres WHERE id = 'd8144000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'FALLA borrar grupo vacío con tarjeta: %', r;
  END IF;
  r := public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000002', 'e8144000-0000-4000-8000-000000000012');
  IF (r->>'ok')::boolean IS DISTINCT FROM true
     OR EXISTS (SELECT 1 FROM public.rondas_libres WHERE id = 'd8144000-0000-4000-8000-000000000012')
     OR EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = '91440000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'FALLA borrar equipo vacío: %', r;
  END IF;
  RAISE NOTICE 'OK borrar un grupo vacío se lleva su tarjeta';
END $$;
RESET ROLE;

-- Vacío sin tarjeta: se borra el grupo.
DO $$
DECLARE r jsonb;
BEGIN
  DELETE FROM public.tournament_group_players WHERE group_id = 'e8144000-0000-4000-8000-000000000006';
  r := public.borrar_grupo_en_juego('b8144000-0000-4000-8000-000000000001', 'e8144000-0000-4000-8000-000000000006');
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR jsonb_typeof(r->'ronda_libre_id') <> 'null'
     OR EXISTS (SELECT 1 FROM public.tournament_groups WHERE id = 'e8144000-0000-4000-8000-000000000006') THEN
    RAISE EXCEPTION 'FALLA borrar grupo vacío sin tarjeta: %', r;
  END IF;
  RAISE NOTICE 'OK borrar un grupo vacío sin tarjeta';
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
SET LOCAL request.jwt.claims = '{"sub":"a8144000-0000-4000-8000-000000000000","role":"authenticated"}';
DO $$
DECLARE bloqueado boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.tournament_groups WHERE id = 'e8144000-0000-4000-8000-000000000002';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'El torneo ya empezó%' THEN RAISE; END IF;
    bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: con el torneo en juego el cliente borró un grupo con tarjeta'; END IF;
  RAISE NOTICE 'OK los triggers grupos_fijos_* siguen cortando al cliente';
END $$;

RESET ROLE;
ROLLBACK;
