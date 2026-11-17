-- Pruebas SQL de los probadores de la Timba (migración 20261117020000) con roles reales. Ver timba-libre.sql.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'probador@prueba.test'),
  ('f0000000-0000-4000-8000-000000000002', 'jugador2@prueba.test');
INSERT INTO public.timba_probadores (user_id) VALUES ('f0000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE reglas AS SELECT '{"config":{"puntitos":[
  {"id":"greenie","tipo":"greenie","valor":1,"destino":"individual","activo":true}]},"jugadorIds":[]}'::jsonb AS r;
GRANT SELECT ON reglas TO anon, authenticated;
-- Una Timba en curso del probador, con él como jugador (para marcar y cerrar).
INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, reglas_juego, holes, estado) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'PROBA3', 'Cancha', current_date, 'f0000000-0000-4000-8000-000000000001',
   'personalizado', (SELECT r FROM reglas), 18, 'en_curso');
INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Probador', 'f0000000-0000-4000-8000-000000000001');

-- ── Probador (no admin): puede crear y actualizar una Timba ─────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$ BEGIN
  IF public.usuario_es_admin() THEN RAISE EXCEPTION 'FALLA: el probador quedó como admin'; END IF;
  IF NOT public.usuario_puede_crear_timba() THEN RAISE EXCEPTION 'FALLA: el probador no puede crear Timba'; END IF;
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('PROBA1', 'Cancha', current_date, 'f0000000-0000-4000-8000-000000000001', 'personalizado', (SELECT r FROM reglas));
  UPDATE public.rondas_libres SET course_name = 'Otra' WHERE codigo = 'PROBA1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FALLA: el probador no pudo actualizar su Timba'; END IF;
  RAISE NOTICE 'OK probador: crea y actualiza una Timba sin ser admin';
END $$;
DO $$ BEGIN
  PERFORM public.marcar_puntito_ronda_libre('PROBA3', 'f2000000-0000-4000-8000-000000000001', 3, 'greenie', true);
  IF public.finalizar_ronda_libre('PROBA3') IS NOT TRUE THEN RAISE EXCEPTION 'FALLA: el probador no pudo cerrar su Timba'; END IF;
  RAISE NOTICE 'OK probador: marca un punto especial y cierra su Timba';
END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.timba_probadores;
  RAISE EXCEPTION 'FALLA: authenticated lee timba_probadores';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK probador: timba_probadores es privada';
END $$;

-- ── Si sacan al probador, su Timba ya no se edita por UPDATE directo ─────────────────────────────────────────
RESET ROLE;
DELETE FROM public.timba_probadores WHERE user_id = 'f0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  UPDATE public.rondas_libres SET course_name = 'Tercera' WHERE codigo = 'PROBA1';
  RAISE EXCEPTION 'FALLA: un ex probador siguió editando su Timba';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK ex probador: UPDATE de su Timba -> 42501';
END $$;

-- ── Otro jugador (ni admin ni probador): sigue sin poder ────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  IF public.usuario_puede_crear_timba() THEN RAISE EXCEPTION 'FALLA: un jugador cualquiera puede crear Timba'; END IF;
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('PROBA2', 'Cancha', current_date, 'f0000000-0000-4000-8000-000000000002', 'personalizado', (SELECT r FROM reglas));
  RAISE EXCEPTION 'FALLA: un no probador creó una Timba';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK no probador: INSERT personalizado -> 42501';
END $$;

-- ── anon: false sin leer nada ────────────────────────────────────────────────────────────────────────────────
RESET request.jwt.claims;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF public.usuario_puede_crear_timba() THEN RAISE EXCEPTION 'FALLA: anon puede crear Timba'; END IF;
  RAISE NOTICE 'OK anon: usuario_puede_crear_timba() = false';
END $$;

ROLLBACK;
