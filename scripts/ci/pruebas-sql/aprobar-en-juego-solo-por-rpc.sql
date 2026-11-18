-- Pruebas SQL de 20261122110000_aprobar_en_juego_solo_por_rpc con ROLES REALES, contra el Postgres desechable del
-- check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas (#814 · PR3).
--
-- Qué exige:
--   · con el torneo en juego, ni el cliente del organizador (authenticated) ni service_role ponen status = 'approved'
--     (a un pendiente ni a un retirado) con un UPDATE directo;
--   · la RPC colocar_inscrito_en_grupo, llamada como service_role (la ruta), sí lo aprueba al colocarlo (D12);
--   · retirar (WD) en juego y aprobar antes del inicio siguen andando.
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a8140000-0000-4000-8000-0000000003a0', 'organizador-814-aprobar@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status) VALUES
  ('b8140000-0000-4000-8000-0000000003a1', 'Abierto', 'ap-abierto', 'a8140000-0000-4000-8000-0000000003a0', current_date, 'open'),
  ('b8140000-0000-4000-8000-0000000003a2', 'En juego', 'ap-en-juego', 'a8140000-0000-4000-8000-0000000003a0', current_date, 'in_progress');

INSERT INTO public.players (id, tournament_id, player_name, handicap_at_registration, status, pending_user_id) VALUES
  ('c8140000-0000-4000-8000-0000000003a1', 'b8140000-0000-4000-8000-0000000003a1', 'Abierto pendiente', 10, 'pending', gen_random_uuid()),
  ('c8140000-0000-4000-8000-0000000003b1', 'b8140000-0000-4000-8000-0000000003a2', 'Pendiente', 10, 'pending', gen_random_uuid()),
  ('c8140000-0000-4000-8000-0000000003b2', 'b8140000-0000-4000-8000-0000000003a2', 'Retirado', 12, 'withdrawn', gen_random_uuid()),
  ('c8140000-0000-4000-8000-0000000003b3', 'b8140000-0000-4000-8000-0000000003a2', 'Aprobado', 14, 'approved', gen_random_uuid());

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d8140000-0000-4000-8000-0000000003a2', 'AP8142', 'Cancha', current_date,
   'a8140000-0000-4000-8000-0000000003a0', 'stroke_play', 18, 'en_curso');

INSERT INTO public.tournament_groups (id, tournament_id, name, ronda_libre_id) VALUES
  ('e8140000-0000-4000-8000-0000000003a2', 'b8140000-0000-4000-8000-0000000003a2', 'Juego G1', 'd8140000-0000-4000-8000-0000000003a2');

-- ── El organizador, desde el cliente ─────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8140000-0000-4000-8000-0000000003a0","role":"authenticated"}';

-- Antes del inicio aprueba y en juego retira, como siempre.
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.players SET status = 'approved' WHERE id = 'c8140000-0000-4000-8000-0000000003a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: antes del inicio el organizador no pudo aprobar (% filas)', n; END IF;
  UPDATE public.players SET status = 'withdrawn' WHERE id = 'c8140000-0000-4000-8000-0000000003b3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: en juego el organizador no pudo retirar (% filas)', n; END IF;
  RAISE NOTICE 'OK antes del inicio aprueba; en juego retira';
END $$;

-- En juego no aprueba a nadie con un UPDATE directo.
DO $$
DECLARE
  intentos text[] := ARRAY[
    $q$UPDATE public.players SET status = 'approved' WHERE id = 'c8140000-0000-4000-8000-0000000003b1'$q$,
    $q$UPDATE public.players SET status = 'approved' WHERE id = 'c8140000-0000-4000-8000-0000000003b2'$q$,
    $q$UPDATE public.players SET status = 'approved' WHERE id = 'c8140000-0000-4000-8000-0000000003b3'$q$
  ];
  q text;
  bloqueado boolean;
BEGIN
  FOREACH q IN ARRAY intentos LOOP
    bloqueado := false;
    BEGIN
      EXECUTE q;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'El torneo ya empezó%' THEN RAISE; END IF;
      bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: en juego el cliente pudo: %', q; END IF;
  END LOOP;
  RAISE NOTICE 'OK en juego el cliente no aprueba a un pendiente ni reaprueba a un retirado';
END $$;

-- ── service_role: tampoco por UPDATE directo; sí por la RPC ──────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE bloqueado boolean := false;
BEGIN
  BEGIN
    UPDATE public.players SET status = 'approved' WHERE id = 'c8140000-0000-4000-8000-0000000003b1';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'El torneo ya empezó%' THEN RAISE; END IF;
    bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: en juego service_role aprobó con un UPDATE directo'; END IF;
  RAISE NOTICE 'OK en juego service_role no aprueba con un UPDATE directo';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.colocar_inscrito_en_grupo(
    'b8140000-0000-4000-8000-0000000003a2',
    'c8140000-0000-4000-8000-0000000003b1',
    'e8140000-0000-4000-8000-0000000003a2',
    jsonb_build_object(
      'inscrito', jsonb_build_object('status', 'pending', 'handicap', 10, 'tee_id', NULL, 'genero', NULL,
                                     'category_id', NULL, 'grupo', NULL),
      'grupos', jsonb_build_array(jsonb_build_object('group_id', 'e8140000-0000-4000-8000-0000000003a2',
                                                     'ronda_libre_id', 'd8140000-0000-4000-8000-0000000003a2',
                                                     'jugadores', '[]'::jsonb))),
    '{"nombre": "Pendiente", "handicap": 10, "handicap_de_inscripcion": true}'::jsonb,
    '[]'::jsonb,
    '{"formato": "stroke_play", "equipo": false, "bola_compartida": false, "match_play": false,
      "al_pie_con_retirado": false, "jugadores_por_equipo": null, "jugadores_por_match": 2}'::jsonb,
    false);
  IF (r->>'ok')::boolean IS DISTINCT FROM true OR (r->>'aprobado')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALLA: la RPC no aprobó al colocar: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c8140000-0000-4000-8000-0000000003b1' AND status = 'approved') THEN
    RAISE EXCEPTION 'FALLA: la RPC dijo aprobado pero el inscrito no quedó approved';
  END IF;
  RAISE NOTICE 'OK la RPC (service_role) aprueba al colocar en juego';
END $$;

RESET ROLE;
ROLLBACK;
