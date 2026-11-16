-- Hándicap de torneo, pieza A (plan docs/superpowers/plans/2026-11-16-torneo-hcp-sin-indice.md): solo esquema,
-- aditivo. Ningún código de la app lee esto todavía; lo empiezan a leer los PR B (predicados + inicio) y C (ruta de
-- edición). ORDEN DE DEPLOY: esta migración aplicada en prod ANTES de promover B, que selecciona la columna (sin ella,
-- 42703 y caen las vistas en vivo).
--
-- 1. ronda_libre_jugadores.handicap_de_inscripcion: "el handicap de esta fila lo gobierna la inscripción del torneo"
--    (players.handicap_at_registration), no el perfil del jugador ni lo que tipeó el creador de una ronda libre.
--    Separa la FUENTE del handicap (perfil vivo vs inscripción) de la PRIVACIDAD sin sesión, que hoy se deducen de lo
--    mismo (user_id + handicap null). La leen las páginas sin sesión: SELECT para anon y authenticated (columna, como
--    el resto de la tabla; ANON_COLUMNS en src/__tests__/helpers/migration-sql.ts la exige en prod).
--    authenticated conserva su UPDATE/INSERT de tabla del baseline, acotado por las policies a las filas de las rondas
--    que creó (gestionar_jugadores): como con `handicap`, el creador puede marcar sus propias filas; no lee ni escribe
--    nada ajeno con esto.
--
-- 2. Backfill (idempotente, solo pone true; no toca ningún handicap): las filas de tarjeta de un torneo
--    (tournament_group_players.jugador_ronda_id) que ya tienen handicap propio son, hoy, las que escribió el inicio
--    del torneo desde la inscripción. Las que tienen handicap null leen el perfil y siguen en false. Medido en prod el
--    16-nov-2026: 12 filas enlazadas, todas con handicap null -> el backfill marca 0. Vive en una función privada para
--    que scripts/ci/pruebas-sql/handicap-de-inscripcion.sql pruebe exactamente esta regla, no una copia.
--
-- 3. RPC editar_handicap_inscrito: la escritura atómica de la edición del índice inscrito con el torneo ya iniciado
--    (PR C). Solo service_role (la ruta valida sesión y organizador antes de llamarla). Ver su comentario.
--
-- Rollback: supabase/migrations/rollback/20261116_handicap_de_inscripcion_rollback.sql

-- ── 1. Columna ───────────────────────────────────────────────────────────────────────────────────────────────
-- Solo metadatos, pero si el ALTER queda en cola detrás de una transacción larga bloquearía todas las lecturas
-- de tarjetas: mejor fallar rápido y reintentar la corrida.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS handicap_de_inscripcion boolean NOT NULL DEFAULT false;

GRANT SELECT (handicap_de_inscripcion) ON public.ronda_libre_jugadores TO anon, authenticated;

-- ── 2. Backfill ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_handicap_de_inscripcion()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores rlj
     SET handicap_de_inscripcion = true
   WHERE rlj.handicap IS NOT NULL
     AND NOT rlj.handicap_de_inscripcion
     AND EXISTS (SELECT 1 FROM public.tournament_group_players tgp WHERE tgp.jugador_ronda_id = rlj.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Privada: la corren esta migración, la prueba SQL (como postgres) y una migración posterior que la re-ejecuta
-- con el PR B ya en prod (los torneos iniciados entre A y B quedan con handicap y flag false).
REVOKE ALL ON FUNCTION public.backfill_handicap_de_inscripcion() FROM PUBLIC, anon, authenticated, service_role;

SELECT public.backfill_handicap_de_inscripcion();

-- ── 3. RPC de edición ────────────────────────────────────────────────────────────────────────────────────────
-- editar_handicap_inscrito: cambia players.handicap_at_registration de UN jugador de un torneo y, en la misma
-- transacción, lo que el inicio del torneo derivó de él: la fila de su tarjeta (ronda_libre_jugadores) y el handicap
-- de su(s) equipo(s) (ronda_equipos). El cálculo lo hace la app (planDeEdicion, PR C); esta función solo escribe, con
-- control optimista: cada handicap_at_registration que el plan leyó se re-verifica con los players bloqueados.
--
-- Parámetros:
--   p_player_id        players.id del editado.
--   p_esperado         su handicap_at_registration tal como lo leyó el plan (null = no tenía).
--   p_valor            el nuevo handicap_at_registration (null = queda sin índice).
--   p_tocar_tarjeta    true = reescribe sus filas de tarjeta (handicap = p_handicap_tarjeta, handicap_de_inscripcion
--                      = true) vía tournament_group_players.jugador_ronda_id. Exige al menos una fila enlazada.
--   p_handicap_tarjeta el handicap de esa fila (null = sin índice). Con p_tocar_tarjeta false debe ser null.
--   p_base             jsonb, array (o null = []): los OTROS jugadores del mismo torneo cuyo handicap_at_registration
--                      entró en el plan (compañeros de equipo). Formato exacto, una entrada por jugador:
--                        [{"player_id": "<uuid players.id>", "esperado": <number | null>}]
--                      Las dos claves son obligatorias ("esperado": null se escribe explícito). El editado no va aquí.
--   p_equipos          jsonb, array (o null = []): los equipos a reescribir. Formato exacto, una entrada por equipo:
--                        [{"equipo_id": "<uuid ronda_equipos.id>", "handicap_equipo": <number | null>,
--                          "handicap_equipo_juego": <integer | null>}]
--                      Las tres claves son obligatorias. handicap_equipo es numeric(4,1) (escala 18 hoyos);
--                      handicap_equipo_juego es smallint (un decimal da error). Cada equipo debe ser de un grupo
--                      (tournament_groups.ronda_libre_id = ronda_equipos.ronda_id) del torneo del editado.
--
-- Devuelve:
--   {"ok": true, "tarjetas": <filas de tarjeta escritas>, "equipos": <equipos escritos>}
--   {"ok": false, "motivo": "conflicto"}  algún esperado no calza o algún player ya no existe; no escribió nada.
--                                         La app relee, replanifica y reintenta.
-- Un parámetro mal formado o un UPDATE que afecta otra cantidad de filas que la esperada -> RAISE (se revierte todo).
CREATE OR REPLACE FUNCTION public.editar_handicap_inscrito(
  p_player_id uuid,
  p_esperado numeric,
  p_valor numeric,
  p_tocar_tarjeta boolean,
  p_handicap_tarjeta numeric,
  p_base jsonb,
  p_equipos jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_base       jsonb := COALESCE(p_base, '[]'::jsonb);
  v_equipos    jsonb := COALESCE(p_equipos, '[]'::jsonb);
  v_ids        uuid[];
  v_bloqueados integer;
  v_torneo     uuid;
  v_esperadas  integer;
  v_n          integer;
  v_tarjetas   integer := 0;
  v_e          jsonb;
BEGIN
  -- Forma de los parámetros.
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_player_id es null';
  END IF;
  IF p_tocar_tarjeta IS NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_tocar_tarjeta es null';
  END IF;
  IF NOT p_tocar_tarjeta AND p_handicap_tarjeta IS NOT NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_handicap_tarjeta sin p_tocar_tarjeta';
  END IF;
  IF jsonb_typeof(v_base) <> 'array' OR jsonb_typeof(v_equipos) <> 'array' THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_base y p_equipos deben ser arrays';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_base) b
              WHERE jsonb_typeof(b) <> 'object' OR NOT (b ? 'player_id') OR NOT (b ? 'esperado')
                 OR jsonb_typeof(b->'player_id') <> 'string'
                 OR jsonb_typeof(b->'esperado') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: entrada de p_base mal formada';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
              WHERE jsonb_typeof(e) <> 'object' OR NOT (e ? 'equipo_id') OR NOT (e ? 'handicap_equipo')
                 OR NOT (e ? 'handicap_equipo_juego')
                 OR jsonb_typeof(e->'equipo_id') <> 'string'
                 OR jsonb_typeof(e->'handicap_equipo') NOT IN ('number', 'null')
                 OR jsonb_typeof(e->'handicap_equipo_juego') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: entrada de p_equipos mal formada';
  END IF;

  -- El editado más la base, sin repetidos.
  v_ids := ARRAY(SELECT (b->>'player_id')::uuid FROM jsonb_array_elements(v_base) b) || p_player_id;
  IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: player repetido en p_base (o el editado está en p_base)';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_equipos) e)
     <> (SELECT count(DISTINCT (e->>'equipo_id')::uuid) FROM jsonb_array_elements(v_equipos) e) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: equipo repetido en p_equipos';
  END IF;

  -- Bloqueo en orden fijo (dos ediciones simultáneas de compañeros no se cruzan en deadlock).
  PERFORM 1 FROM public.players p WHERE p.id = ANY (v_ids) ORDER BY p.id FOR NO KEY UPDATE;
  GET DIAGNOSTICS v_bloqueados = ROW_COUNT;
  IF v_bloqueados <> cardinality(v_ids) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto');
  END IF;

  SELECT p.tournament_id INTO v_torneo FROM public.players p WHERE p.id = p_player_id;
  IF EXISTS (SELECT 1 FROM public.players p WHERE p.id = ANY (v_ids) AND p.tournament_id IS DISTINCT FROM v_torneo) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_base trae un jugador de otro torneo';
  END IF;

  -- Control optimista: todo lo que el plan leyó sigue igual.
  IF NOT EXISTS (SELECT 1 FROM public.players p
                  WHERE p.id = p_player_id AND p.handicap_at_registration IS NOT DISTINCT FROM p_esperado)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_base) b
                  JOIN public.players p ON p.id = (b->>'player_id')::uuid
                 WHERE p.handicap_at_registration IS DISTINCT FROM (b->>'esperado')::numeric) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto');
  END IF;

  -- Escrituras.
  UPDATE public.players SET handicap_at_registration = p_valor WHERE id = p_player_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: players actualizó % filas (esperaba 1)', v_n;
  END IF;

  IF p_tocar_tarjeta THEN
    SELECT count(DISTINCT tgp.jugador_ronda_id) INTO v_esperadas
      FROM public.tournament_group_players tgp
     WHERE tgp.player_id = p_player_id AND tgp.jugador_ronda_id IS NOT NULL;
    IF v_esperadas = 0 THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: p_tocar_tarjeta sin tarjeta enlazada';
    END IF;
    UPDATE public.ronda_libre_jugadores rlj
       SET handicap = p_handicap_tarjeta, handicap_de_inscripcion = true
     WHERE rlj.id IN (SELECT tgp.jugador_ronda_id FROM public.tournament_group_players tgp
                       WHERE tgp.player_id = p_player_id AND tgp.jugador_ronda_id IS NOT NULL);
    GET DIAGNOSTICS v_tarjetas = ROW_COUNT;
    IF v_tarjetas <> v_esperadas THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: tarjeta actualizó % filas (esperaba %)', v_tarjetas, v_esperadas;
    END IF;
  END IF;

  FOR v_e IN SELECT e FROM jsonb_array_elements(v_equipos) e LOOP
    UPDATE public.ronda_equipos re
       SET handicap_equipo = (v_e->>'handicap_equipo')::numeric,
           handicap_equipo_juego = (v_e->>'handicap_equipo_juego')::smallint
     WHERE re.id = (v_e->>'equipo_id')::uuid
       AND EXISTS (SELECT 1 FROM public.tournament_groups tg
                    WHERE tg.ronda_libre_id = re.ronda_id AND tg.tournament_id = v_torneo);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: el equipo % no es de un grupo del torneo (% filas)',
        v_e->>'equipo_id', v_n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'tarjetas', v_tarjetas, 'equipos', jsonb_array_length(v_equipos));
END;
$$;

-- Privada para el cliente: solo la ruta del servidor (service role) la llama.
REVOKE ALL ON FUNCTION public.editar_handicap_inscrito(uuid, numeric, numeric, boolean, numeric, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_handicap_inscrito(uuid, numeric, numeric, boolean, numeric, jsonb, jsonb)
  TO service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_column_privilege(r, 'public.ronda_libre_jugadores', 'handicap_de_inscripcion', 'SELECT') THEN
      RAISE EXCEPTION '% no lee ronda_libre_jugadores.handicap_de_inscripcion', r;
    END IF;
    IF has_function_privilege(r, 'public.editar_handicap_inscrito(uuid,numeric,numeric,boolean,numeric,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege(r, 'public.backfill_handicap_de_inscripcion()', 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar una función privada de handicap_de_inscripcion', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.editar_handicap_inscrito(uuid,numeric,numeric,boolean,numeric,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role no puede ejecutar editar_handicap_inscrito';
  END IF;
END $$;
