-- Pruebas SQL de Timba libre con ROLES REALES (anon / authenticated con su JWT), contra el Postgres desechable del
-- check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas. Antes el SQL de la migración
-- 20261027180000 solo se ejecutaba en prod: el test de integración se saltaba y además usaba service_role,
-- que no pasa por RLS ni por los GRANT.
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado (psql con ON_ERROR_STOP corta
-- ahí y el job queda rojo). Todo corre en una transacción que termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin@prueba.test'),
  ('b0000000-0000-4000-8000-000000000002', 'jugador@prueba.test'),
  ('c0000000-0000-4000-8000-000000000003', 'ajeno@prueba.test');
-- handle_new_user crea los perfiles como 'player'.
UPDATE public.profiles SET role = 'admin' WHERE id = 'a0000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE reglas AS SELECT '{"config":{"puntitos":[
  {"id":"greenie","tipo":"greenie","valor":1,"destino":"individual","activo":true},
  {"id":"sandy","tipo":"sandy","valor":1,"destino":"individual","activo":true}]},"jugadorIds":[]}'::jsonb AS r;
GRANT SELECT ON reglas TO anon, authenticated;

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, reglas_juego, holes, estado) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'TIMBAU', 'Cancha', current_date, 'b0000000-0000-4000-8000-000000000002',
   'personalizado', (SELECT r FROM reglas), 18, 'en_curso'),
  ('d0000000-0000-4000-8000-000000000002', 'TIMBAF', 'Cancha', current_date, 'a0000000-0000-4000-8000-000000000001',
   'personalizado', (SELECT r FROM reglas), 18, 'finalizada'),
  ('d0000000-0000-4000-8000-000000000003', 'NORMAL', 'Cancha', current_date, 'b0000000-0000-4000-8000-000000000002',
   'stroke_play', NULL, 18, 'en_curso'),
  -- Timba de un admin donde juega un usuario que no es admin.
  ('d0000000-0000-4000-8000-000000000004', 'TIMBAX', 'Cancha', current_date, 'a0000000-0000-4000-8000-000000000001',
   'personalizado', (SELECT r FROM reglas), 18, 'en_curso');
INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id) VALUES
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000004', 'Jugador', 'b0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Jugador', 'b0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Pedro', NULL),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'Juan', NULL),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002', 'Diego', NULL);

-- ── Usuario NO admin ─────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$ BEGIN
  IF public.usuario_es_admin() THEN RAISE EXCEPTION 'FALLA: usuario_es_admin() es true para un jugador'; END IF;
  RAISE NOTICE 'OK no admin: usuario_es_admin() = false';
END $$;

DO $$ BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('NOADM1', 'Cancha', current_date, 'b0000000-0000-4000-8000-000000000002', 'personalizado', (SELECT r FROM reglas));
  RAISE EXCEPTION 'FALLA: un no admin creó una ronda personalizado';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK no admin: INSERT personalizado -> 42501';
END $$;

DO $$ BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego)
  VALUES ('NOADM2', 'Cancha', current_date, 'b0000000-0000-4000-8000-000000000002', 'stroke_play');
  RAISE NOTICE 'OK no admin: INSERT stroke_play pasa (la guarda solo mira personalizado)';
END $$;

DO $$ BEGIN
  UPDATE public.rondas_libres SET formato_juego = 'personalizado', reglas_juego = (SELECT r FROM reglas)
  WHERE id = 'd0000000-0000-4000-8000-000000000003';
  RAISE EXCEPTION 'FALLA: un no admin pasó su ronda a personalizado';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK no admin: UPDATE a personalizado -> 42501';
END $$;

DO $$ BEGIN
  UPDATE public.rondas_libres SET reglas_juego = (SELECT r FROM reglas) || '{"x":1}'
  WHERE id = 'd0000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FALLA: un no admin cambió reglas_juego';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK no admin: UPDATE de reglas_juego -> 42501';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('TIMBAF', 'e0000000-0000-4000-8000-000000000004', 3, 'greenie', true);
  RAISE EXCEPTION 'FALLA: marcó en una ronda finalizada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN RAISE NOTICE 'OK RPC en ronda finalizada -> P0002';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000002', 3, 'birdie', true);
  RAISE EXCEPTION 'FALLA: aceptó un punto que no está en las reglas';
EXCEPTION WHEN SQLSTATE '22023' THEN RAISE NOTICE 'OK RPC con punto fuera de las reglas -> 22023';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000002', 3, 'greenie', true);
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000003', 3, 'greenie', true);
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000002', 3, 'greenie', true);
  RAISE NOTICE 'OK RPC greenie Pedro -> Juan -> Pedro sin error';
END $$;

DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  r1 := public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000003', 5, 'greenie', true,
    20, 'f0000000-0000-4000-8000-0000000000ff');
  r2 := public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000002', 5, 'greenie', true,
    10, 'f0000000-0000-4000-8000-0000000000ff');
  IF (r1->>'aplicada')::boolean IS NOT TRUE OR (r2->>'aplicada')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALLA: secuencia — nueva % / vieja %', r1, r2;
  END IF;
  RAISE NOTICE 'OK RPC p_seq viejo del mismo dispositivo no se aplica';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_retiro_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000003', 10);
  RAISE NOTICE 'OK RPC retiro sin error';
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.ronda_libre_puntitos LIMIT 1;
  RAISE EXCEPTION 'FALLA: authenticated lee ronda_libre_puntitos';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK authenticated no lee ronda_libre_puntitos -> 42501';
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.ronda_libre_retiros LIMIT 1;
  RAISE EXCEPTION 'FALLA: authenticated lee ronda_libre_retiros';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK authenticated no lee ronda_libre_retiros -> 42501';
END $$;

-- Timba de un admin donde juega: no puede tocar reglas ni formato, pero sí cerrarla (el camino legítimo).
DO $
DECLARE n integer;
BEGIN
  UPDATE public.rondas_libres SET reglas_juego = '{"config":{"puntitos":[]},"jugadorIds":[]}'
  WHERE id = 'd0000000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: un jugador no admin cambió reglas_juego de la Timba de un admin'; END IF;
  UPDATE public.rondas_libres SET formato_juego = 'stroke_play', reglas_juego = NULL
  WHERE id = 'd0000000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: un jugador no admin cambió el formato de la Timba de un admin'; END IF;
  RAISE NOTICE 'OK jugador no admin de la Timba de un admin: no cambia reglas ni formato (0 filas)';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OK jugador no admin de la Timba de un admin: no cambia reglas ni formato (42501)';
END $;

DO $ BEGIN
  IF public.finalizar_ronda_libre('TIMBAX') IS NOT TRUE THEN
    RAISE EXCEPTION 'FALLA: un jugador no admin no pudo cerrar la Timba de un admin';
  END IF;
  RAISE NOTICE 'OK jugador no admin cierra la Timba de un admin (finalizar_ronda_libre)';
END $;

-- ── Usuario que NO es miembro de la ronda ────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000001', 3, 'sandy', true);
  RAISE EXCEPTION 'FALLA: alguien ajeno marcó a un jugador con cuenta';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK RPC de un ajeno sobre jugador con user_id -> P0003';
END $$;

-- ── anon ─────────────────────────────────────────────────────────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$ BEGIN
  IF public.usuario_es_admin() THEN RAISE EXCEPTION 'FALLA: usuario_es_admin() es true para anon'; END IF;
  RAISE NOTICE 'OK anon: usuario_es_admin() = false';
END $$;

DO $$
DECLARE n integer;
BEGIN
  -- Las guardas son TO public: sin EXECUTE de usuario_es_admin() para anon esto daba 42501.
  UPDATE public.rondas_libres SET course_name = 'x' WHERE id = 'd0000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: anon actualizó % rondas', n; END IF;
  RAISE NOTICE 'OK anon: UPDATE pasa por las policies (0 filas, sin 42501)';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('TIMBAU', 'e0000000-0000-4000-8000-000000000002', 7, 'greenie', true);
  RAISE EXCEPTION 'FALLA: anon ejecutó la RPC';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon: sin EXECUTE de marcar_puntito_ronda_libre -> 42501';
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.ronda_libre_puntitos LIMIT 1;
  RAISE EXCEPTION 'FALLA: anon lee ronda_libre_puntitos';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no lee ronda_libre_puntitos -> 42501';
END $$;

-- ── Admin ────────────────────────────────────────────────────────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$ BEGIN
  INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('d0000000-0000-4000-8000-000000000009', 'TIMBAA', 'Cancha', current_date, 'a0000000-0000-4000-8000-000000000001',
          'personalizado', (SELECT r FROM reglas));
  UPDATE public.rondas_libres SET reglas_juego = (SELECT r FROM reglas) WHERE id = 'd0000000-0000-4000-8000-000000000009';
  INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id)
  VALUES ('e0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009', 'Admin', 'a0000000-0000-4000-8000-000000000001');
  PERFORM public.marcar_puntito_ronda_libre('TIMBAA', 'e0000000-0000-4000-8000-000000000009', 3, 'greenie', true);
  RAISE NOTICE 'OK admin: crea, edita reglas y marca';
END $$;

-- ── Lo que quedó escrito (como postgres) ─────────────────────────────────────────────────────────────────────
RESET ROLE;

DO $$
DECLARE greenies uuid[];
BEGIN
  SELECT array_agg(jugador_id) INTO greenies FROM public.ronda_libre_puntitos
  WHERE ronda_id = 'd0000000-0000-4000-8000-000000000001' AND hoyo = 3 AND puntito_id = 'greenie';
  IF greenies IS DISTINCT FROM ARRAY['e0000000-0000-4000-8000-000000000002'::uuid] THEN
    RAISE EXCEPTION 'FALLA: greenie del hoyo 3 = % (esperaba solo Pedro)', greenies;
  END IF;
  SELECT array_agg(jugador_id) INTO greenies FROM public.ronda_libre_puntitos
  WHERE ronda_id = 'd0000000-0000-4000-8000-000000000001' AND hoyo = 5 AND puntito_id = 'greenie';
  IF greenies IS DISTINCT FROM ARRAY['e0000000-0000-4000-8000-000000000003'::uuid] THEN
    RAISE EXCEPTION 'FALLA: greenie del hoyo 5 = % (esperaba solo Juan: la marca vieja no pisa)', greenies;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_retiros WHERE jugador_id = 'e0000000-0000-4000-8000-000000000003' AND desde_hoyo = 10) THEN
    RAISE EXCEPTION 'FALLA: el retiro no quedó guardado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_puntitos WHERE ronda_id = 'd0000000-0000-4000-8000-000000000009') THEN
    RAISE EXCEPTION 'FALLA: la marca del admin no quedó guardada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rondas_libres WHERE id = 'd0000000-0000-4000-8000-000000000004'
                 AND estado = 'finalizada' AND formato_juego = 'personalizado' AND reglas_juego = (SELECT r FROM reglas)) THEN
    RAISE EXCEPTION 'FALLA: la Timba del admin no quedó finalizada con su formato y sus reglas intactas';
  END IF;
  RAISE NOTICE 'OK greenie Pedro -> Juan -> Pedro deja solo a Pedro; p_seq viejo no pisa; retiro y marca del admin guardados; Timba del admin cerrada con reglas intactas';
END $$;

ROLLBACK;
