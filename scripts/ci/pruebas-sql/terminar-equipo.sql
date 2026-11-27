-- Pruebas SQL de 20261127150000_terminar_equipo_de_ronda («Terminar mi equipo» y cierre al último) con ROLES REALES
-- (anon / authenticated + su JWT), contra el Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con
-- todas las migraciones aplicadas.
--
-- Qué exige:
--   · un equipo de hoy queda con terminado_at NULL; anon no ejecuta terminar ni reabrir;
--   · permisos: el anotador termina SU equipo; el creador termina un equipo SIN anotador y no uno de otro celular;
--     un extraño no termina ni reabre nada; el creador no reabre el de otro celular; un equipo no nace terminado; demo, admin_mode y equipo que no es de club → P0003; ronda inexistente → P0001;
--   · tarjeta incompleta → {estado:'incompleto'} sin marcar; completa → ok y ronda sigue en curso si falta otro;
--   · el último en terminar cierra la ronda (estado 'finalizada') y devuelve ronda_cerrada TRUE;
--   · reintento con la ronda ya cerrada → ok con ronda_cerrada TRUE (no error);
--   · equipo terminado: un delta repetido pasa (reintento), uno distinto → P0003 equipo_terminado; por la tabla
--     tampoco; terminado_at no se cambia por la tabla;
--   · reabrir: vuelve a NULL y deja corregir; con la ronda cerrada → P0002.
-- La carrera de dos «terminar» a la vez la ordena el FOR UPDATE de la ronda (dos sesiones no caben en este archivo).
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a7e00000-0000-4000-8000-000000000001', 'creador-terminar@prueba.test', '{"name":"Creador"}'),
  ('a7e00000-0000-4000-8000-000000000002', 'pedro-terminar@prueba.test', '{"name":"Pedro"}'),
  ('a7e00000-0000-4000-8000-000000000004', 'extrano-terminar@prueba.test', '{"name":"Extraño"}');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, modo_juego, holes, estado, admin_mode, es_demo) VALUES
  -- Un celular por equipo, 18 hoyos: el caso del sábado.
  ('b7e00000-0000-4000-8000-000000000001', 'TRM001', 'Cancha', current_date,
   'a7e00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false, false),
  -- Un celular para todos (admin_mode).
  ('b7e00000-0000-4000-8000-000000000002', 'TRM002', 'Cancha', current_date,
   'a7e00000-0000-4000-8000-000000000001', 'scramble', 'neto', 9, 'en_curso', true, false),
  -- Un celular por equipo con un equipo que no es de club.
  ('b7e00000-0000-4000-8000-000000000003', 'TRM003', 'Cancha', current_date,
   'a7e00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false, false),
  -- Demo.
  ('b7e00000-0000-4000-8000-000000000004', 'TRM004', 'Cancha', current_date,
   'a7e00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false, true);

-- 18 hoyos completos y 17 (falta el 18).
CREATE TEMP TABLE t_tarjetas ON COMMIT DROP AS
SELECT
  (SELECT jsonb_object_agg(h::text, 4) FROM generate_series(1, 18) h) AS completa,
  (SELECT jsonb_object_agg(h::text, 4) FROM generate_series(1, 17) h) AS incompleta;
GRANT SELECT ON t_tarjetas TO authenticated, anon;

INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego, handicap_origen, anotador_user_id, scores) VALUES
  -- El del creador (lo anota él).
  ('f7e00000-0000-4000-8000-000000000011', 'b7e00000-0000-4000-8000-000000000001', 'Creador', 8, 8, 'club',
   'a7e00000-0000-4000-8000-000000000001', (SELECT incompleta FROM t_tarjetas)),
  -- El de Pedro (otro celular).
  ('f7e00000-0000-4000-8000-000000000012', 'b7e00000-0000-4000-8000-000000000001', 'Pedro', 12, 12, 'club',
   'a7e00000-0000-4000-8000-000000000002', (SELECT completa FROM t_tarjetas)),
  -- Uno sin anotador («Anotarlo yo» / liberado): lo termina el creador.
  ('f7e00000-0000-4000-8000-000000000013', 'b7e00000-0000-4000-8000-000000000001', 'Libre', 10, 10, 'club',
   NULL, (SELECT completa FROM t_tarjetas)),
  -- Un equipo calculado (no de club).
  ('f7e00000-0000-4000-8000-000000000031', 'b7e00000-0000-4000-8000-000000000003', 'Calculado', 8, 8, 'calculado',
   NULL, (SELECT completa FROM t_tarjetas)),
  -- Admin mode.
  ('f7e00000-0000-4000-8000-000000000021', 'b7e00000-0000-4000-8000-000000000002', 'Admin', 8, 8, 'club',
   NULL, (SELECT completa FROM t_tarjetas)),
  -- Demo.
  ('f7e00000-0000-4000-8000-000000000041', 'b7e00000-0000-4000-8000-000000000004', 'Demo', 8, 8, 'club',
   'a7e00000-0000-4000-8000-000000000001', (SELECT completa FROM t_tarjetas));

-- ── Esquema (como postgres) ──────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.ronda_equipos WHERE ronda_id = 'b7e00000-0000-4000-8000-000000000001' AND terminado_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FALLA: un equipo insertado como hoy no quedó con terminado_at NULL';
  END IF;
  IF NOT public.ronda_libre_tarjeta_completa((SELECT completa FROM t_tarjetas), 18)
     OR public.ronda_libre_tarjeta_completa((SELECT incompleta FROM t_tarjetas), 18)
     OR NOT public.ronda_libre_tarjeta_completa((SELECT incompleta FROM t_tarjetas), 9)
     OR public.ronda_libre_tarjeta_completa(NULL, 18)
     OR public.ronda_libre_tarjeta_completa('[1]'::jsonb, 1) THEN
    RAISE EXCEPTION 'FALLA: ronda_libre_tarjeta_completa no sigue la regla de finalizar_ronda_libre';
  END IF;
  RAISE NOTICE 'OK terminado_at NULL por defecto; regla de tarjeta completa';
END $$;

-- ── anon: no termina ni reabre ───────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$ BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: anon ejecutó terminar_equipo_de_ronda';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no termina -> 42501';
END $$;

DO $$ BEGIN
  PERFORM public.reabrir_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: anon ejecutó reabrir_equipo_de_ronda';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no reabre -> 42501';
END $$;

RESET ROLE;

-- ── Extraño: no termina ningún equipo ────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: un extraño terminó un equipo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no termina -> P0003';
END $$;

DO $$ BEGIN
  -- La segunda rama del permiso (equipo sin anotador) es solo del creador.
  PERFORM public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000013');
  RAISE EXCEPTION 'FALLA: un extraño terminó un equipo sin anotador';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no termina un equipo sin anotador -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.reabrir_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000013');
  RAISE EXCEPTION 'FALLA: un extraño reabrió un equipo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no reabre -> P0003';
END $$;

-- ── Creador: no termina el equipo de otro celular; los modos que no aplican; incompleto ──────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: el creador terminó el equipo que anota otro celular';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'equipo_de_otro_anotador' THEN RAISE EXCEPTION 'FALLA: P0003 por otra razón: %', v_detail; END IF;
  RAISE NOTICE 'OK creador no termina el equipo de otro celular -> P0003';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  -- El equipo sin anotador lo termina el creador; quedan otros, la ronda sigue.
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000013');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":false}'::jsonb THEN RAISE EXCEPTION 'FALLA: el creador no terminó el equipo libre: %', r; END IF;
  RAISE NOTICE 'OK el creador termina un equipo sin anotador';
END $$;

DO $$ BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM002', 'f7e00000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FALLA: se terminó un equipo de una ronda de un celular (admin_mode)';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK admin_mode -> P0003';
END $$;

DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM003', 'f7e00000-0000-4000-8000-000000000031');
  RAISE EXCEPTION 'FALLA: se terminó un equipo que no es de club';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'equipo no es de club' THEN RAISE EXCEPTION 'FALLA: equipo calculado dio P0003 por otra razón: %', v_detail; END IF;
  RAISE NOTICE 'OK equipo que no es de club -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.terminar_equipo_de_ronda('TRM004', 'f7e00000-0000-4000-8000-000000000041');
  RAISE EXCEPTION 'FALLA: se terminó un equipo de una ronda demo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK demo -> P0003';
END $$;

DO $$
DECLARE v_msg text;
BEGIN
  PERFORM public.terminar_equipo_de_ronda('NOEXISTE', 'f7e00000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'FALLA: terminar en una ronda inexistente no dio P0001' USING ERRCODE = 'P0009';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  IF v_msg IS DISTINCT FROM 'RONDA_NOT_FOUND' THEN RAISE EXCEPTION 'FALLA: ronda inexistente: P0001 con otro mensaje: %', v_msg USING ERRCODE = 'P0009'; END IF;
  RAISE NOTICE 'OK ronda inexistente -> P0001';
END $$;

DO $$
DECLARE v_msg text;
BEGIN
  -- El equipo existe pero en otra ronda.
  PERFORM public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FALLA: terminar un equipo de otra ronda no dio P0001' USING ERRCODE = 'P0009';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  IF v_msg IS DISTINCT FROM 'RONDA_NOT_FOUND' THEN RAISE EXCEPTION 'FALLA: equipo de otra ronda: P0001 con otro mensaje: %', v_msg USING ERRCODE = 'P0009'; END IF;
  RAISE NOTICE 'OK equipo de otra ronda -> P0001';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000011');
  IF r IS DISTINCT FROM '{"estado":"incompleto"}'::jsonb THEN RAISE EXCEPTION 'FALLA: tarjeta incompleta devolvió %', r; END IF;
  IF (SELECT terminado_at FROM public.ronda_equipos WHERE id = 'f7e00000-0000-4000-8000-000000000011') IS NOT NULL THEN
    RAISE EXCEPTION 'FALLA: una tarjeta incompleta quedó terminada';
  END IF;
  RAISE NOTICE 'OK tarjeta incompleta -> incompleto, sin marcar';
END $$;

-- ── Pedro termina primero: la ronda sigue en curso; su tarjeta queda cerrada ─────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":false}'::jsonb THEN RAISE EXCEPTION 'FALLA: terminar el primero devolvió %', r; END IF;
  -- Idempotente: terminar otra vez no cambia nada.
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":false}'::jsonb THEN RAISE EXCEPTION 'FALLA: repetir terminar devolvió %', r; END IF;
  RAISE NOTICE 'OK el primero en terminar no cierra la ronda; repetir es idempotente';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  -- Reintento de un hoyo ya guardado: no cambia los scores y pasa.
  r := public.upsert_ronda_equipos_scores('f7e00000-0000-4000-8000-000000000012', 'TRM001', '{"18": 4}'::jsonb);
  IF r->>'18' IS DISTINCT FROM '4' THEN RAISE EXCEPTION 'FALLA: el reintento devolvió %', r; END IF;
  RAISE NOTICE 'OK equipo terminado: un delta repetido pasa';
END $$;

DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f7e00000-0000-4000-8000-000000000012', 'TRM001', '{"18": 5}'::jsonb);
  RAISE EXCEPTION 'FALLA: se cambió un hoyo de un equipo terminado';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'equipo_terminado' THEN RAISE EXCEPTION 'FALLA: P0003 por otra razón: %', v_detail; END IF;
  RAISE NOTICE 'OK equipo terminado: un delta distinto -> P0003 equipo_terminado';
END $$;

-- Por la tabla: el creador (la policy le deja escribir las filas de su ronda) no cambia terminado_at ni los scores
-- de un equipo terminado.
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$ BEGIN
  UPDATE public.ronda_equipos SET terminado_at = NULL WHERE id = 'f7e00000-0000-4000-8000-000000000012';
  IF NOT FOUND THEN RAISE EXCEPTION 'FALLA: la prueba no alcanzó la fila (RLS): no prueba el trigger'; END IF;
  RAISE EXCEPTION 'FALLA: el creador cambió terminado_at por la tabla';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK terminado_at no se cambia por la tabla -> 42501';
END $$;

DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.reabrir_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: el creador reabrió el equipo que anota otro celular';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'equipo_de_otro_anotador' THEN RAISE EXCEPTION 'FALLA: P0003 por otra razón: %', v_detail; END IF;
  RAISE NOTICE 'OK creador no reabre el equipo de otro celular -> P0003';
END $$;

DO $$
DECLARE v_msg text;
BEGIN
  INSERT INTO public.ronda_equipos (ronda_id, nombre, handicap_equipo, handicap_equipo_juego, handicap_origen, terminado_at)
  VALUES ('b7e00000-0000-4000-8000-000000000001', 'Nace terminado', 0, 0, 'club', now());
  RAISE EXCEPTION 'FALLA: el creador insertó un equipo ya terminado';
EXCEPTION WHEN insufficient_privilege THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  IF v_msg IS DISTINCT FROM 'TERMINADO_SOLO_POR_RPC' THEN RAISE EXCEPTION 'FALLA: el INSERT se rechazó por otra razón: %', v_msg; END IF;
  RAISE NOTICE 'OK un equipo no se inserta terminado -> 42501';
END $$;

-- Liberar el equipo de Pedro (el creador puede) y escribir sus scores por la tabla: el equipo sigue terminado.
DO $$
DECLARE v_detail text;
BEGIN
  IF (public.liberar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012'))->>'estado' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'FALLA: no se pudo liberar el equipo (la prueba del trigger no correría)';
  END IF;
  UPDATE public.ronda_equipos SET scores = scores || '{"18": 7}'::jsonb WHERE id = 'f7e00000-0000-4000-8000-000000000012';
  IF NOT FOUND THEN RAISE EXCEPTION 'FALLA: la prueba no alcanzó la fila (RLS): no prueba el trigger'; END IF;
  RAISE EXCEPTION 'FALLA: se cambió por la tabla la tarjeta de un equipo terminado';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'equipo_terminado' THEN RAISE EXCEPTION 'FALLA: P0003 por otra razón: %', v_detail; END IF;
  RAISE NOTICE 'OK scores de un equipo terminado no cambian por la tabla -> P0003 equipo_terminado';
END $$;

-- Como el DO de arriba terminó en excepción, la liberación también se deshizo: Pedro sigue siendo el anotador.
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000002","role":"authenticated"}';

-- ── Pedro reabre, corrige y vuelve a terminar ────────────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reabrir_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  IF r IS DISTINCT FROM '{"estado":"ok"}'::jsonb THEN RAISE EXCEPTION 'FALLA: reabrir devolvió %', r; END IF;
  r := public.upsert_ronda_equipos_scores('f7e00000-0000-4000-8000-000000000012', 'TRM001', '{"18": 5}'::jsonb);
  IF r->>'18' IS DISTINCT FROM '5' THEN RAISE EXCEPTION 'FALLA: no se pudo corregir tras reabrir: %', r; END IF;
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000012');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":false}'::jsonb THEN RAISE EXCEPTION 'FALLA: volver a terminar devolvió %', r; END IF;
  RAISE NOTICE 'OK reabrir deja corregir y volver a terminar';
END $$;

-- ── El creador completa y termina: es el último, la ronda se cierra ──────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a7e00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f7e00000-0000-4000-8000-000000000011', 'TRM001', '{"18": 3}'::jsonb);
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000011');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":true}'::jsonb THEN RAISE EXCEPTION 'FALLA: el último en terminar devolvió %', r; END IF;
  IF (SELECT estado FROM public.rondas_libres WHERE codigo = 'TRM001') IS DISTINCT FROM 'finalizada' THEN
    RAISE EXCEPTION 'FALLA: la ronda no quedó finalizada al terminar el último';
  END IF;
  -- Reintento con la respuesta perdida: ok y cerrada, sin error.
  r := public.terminar_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000011');
  IF r IS DISTINCT FROM '{"estado":"ok","ronda_cerrada":true}'::jsonb THEN RAISE EXCEPTION 'FALLA: el reintento tras cerrar devolvió %', r; END IF;
  RAISE NOTICE 'OK el último en terminar cierra la ronda; el reintento no falla';
END $$;

DO $$ BEGIN
  PERFORM public.reabrir_equipo_de_ronda('TRM001', 'f7e00000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'FALLA: se reabrió un equipo con la ronda cerrada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN RAISE NOTICE 'OK ronda cerrada no se reabre -> P0002';
END $$;

RESET ROLE;

ROLLBACK;
