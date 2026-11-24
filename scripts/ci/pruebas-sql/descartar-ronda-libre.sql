-- Pruebas SQL de 20261124120000_descartar_solo_ronda_en_curso con ROLES REALES (authenticated + su JWT), contra el
-- Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige: descartar_ronda_libre no borra una ronda cerrada (P0002) y sigue borrando la ronda en curso de su
-- creador; a quien no es el creador lo sigue rechazando por permiso (P0003), también con la ronda cerrada.
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'creador@prueba.test'),
  ('b2000000-0000-4000-8000-000000000002', 'ajeno@prueba.test');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'DESCEC', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso'),
  ('d2000000-0000-4000-8000-000000000002', 'DESCFI', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'finalizada');

INSERT INTO public.ronda_libre_jugadores (ronda_id, nombre, user_id, handicap, scores) VALUES
  ('d2000000-0000-4000-8000-000000000002', 'Creador', 'a2000000-0000-4000-8000-000000000001', 12, '{"1": 5}'::jsonb);

-- ── Quien no es el creador: permiso antes que estado ─────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCFI');
  RAISE EXCEPTION 'FALLA: un ajeno descartó una ronda cerrada';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  RAISE NOTICE 'OK un ajeno no descarta (P0003), aunque la ronda esté cerrada';
END $$;

-- ── El creador ───────────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCFI');
  RAISE EXCEPTION 'FALLA: el creador descartó una ronda finalizada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN
  RAISE NOTICE 'OK una ronda finalizada no se descarta (P0002)';
END $$;

DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCEC');
  RAISE NOTICE 'OK el creador descarta su ronda en curso';
END $$;

-- ── Lo que quedó (como postgres) ─────────────────────────────────────────────────────────────────────────────
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rondas_libres WHERE codigo = 'DESCFI') THEN
    RAISE EXCEPTION 'FALLA: la ronda finalizada ya no está';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE ronda_id = 'd2000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FALLA: la tarjeta de la ronda finalizada ya no está';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rondas_libres WHERE codigo = 'DESCEC') THEN
    RAISE EXCEPTION 'FALLA: la ronda en curso no se borró';
  END IF;
  RAISE NOTICE 'OK la finalizada sigue con su tarjeta y la en curso se borró';
END $$;

ROLLBACK;
