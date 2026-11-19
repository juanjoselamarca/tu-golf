-- Grupo nuevo (o vacío) con el torneo EN JUEGO, y borrar un grupo vacío (#814 · PR4, decisiones D5, D7 y D14).
-- Plan: docs/superpowers/plans/2026-11-18-gestion-en-juego-814.md.
--
-- Por qué RPC: crear un grupo en juego escribe dos tablas (rondas_libres + tournament_groups) y borrarlo otras dos.
-- Regla del plan: ninguna ruta hace escrituras multi-tabla fuera de una RPC. La app arma la tarjeta con la misma
-- función pura del inicio (`tarjetaDeGrupoDeTorneo`, src/lib/data/tournaments/startTournament.ts) y estas RPC
-- solo escriben, bajo lock.
--
-- La tarjeta de un grupo nuevo nace VACÍA, igual que la deja `colocar_inscrito_en_grupo` (20261122100000) cuando
-- sale el último: sin filas (`ronda_libre_jugadores`) y sin equipo (`ronda_equipos`). El equipo lo crea
-- `colocar_inscrito_en_grupo` cuando llega el primero (con el nombre del grupo y el hándicap de `p_equipos`), y en
-- match play esa misma RPC fija el formato con el conteo final. En bola compartida el grupo queda incompleto hasta
-- tener el mínimo (D5/D7); en mejor bola, un jugador ya anota (D14).
--
-- Locks, en el orden de `colocar_inscrito_en_grupo` (advisory → tournaments → rondas_libres → rlj → re):
--   1. pg_advisory_xact_lock('grupos:'||torneo): una gestión de grupos del torneo a la vez;
--   2. tournaments FOR UPDATE, exigiendo status = 'in_progress' y una sola ronda (falla cerrada, como el PR2);
--   3. (borrar) la tarjeta del grupo FOR UPDATE, y sus filas y equipos FOR UPDATE: un golpe del scorer espera o
--      queda visto.
--
-- Los triggers grupos_fijos_* (20261117120000) quedan intactos: cortan solo a anon/authenticated, y estas funciones
-- son SECURITY DEFINER (corren como postgres), igual que `colocar_inscrito_en_grupo`. Por eso validan adentro lo
-- que la guarda no ve: torneo in_progress, grupo del torneo, grupo sin jugadores ni golpes. Solo las ejecuta
-- service_role (la ruta valida sesión y organizer_id).
--
-- Prueba: scripts/ci/pruebas-sql/grupo-en-juego.sql.
-- Rollback: supabase/migrations/rollback/20261123100000_grupo_en_juego_rollback.sql

-- ── 1. Crear ─────────────────────────────────────────────────────────────────────────────────────────────────
-- p_group_id null    → grupo nuevo llamado p_nombre (al final del orden de salida);
-- p_group_id no null → un grupo del torneo SIN tarjeta y SIN inscritos (uno vacío que el inicio no armó) recibe su
--                      tarjeta; p_nombre tiene que ser null (conserva el suyo).
-- p_tarjeta (formato EXACTO; mal formado → RAISE), `tarjetaDeGrupoDeTorneo` más código y creador:
--   {"codigo": <text>, "creador_id": <uuid>, "course_id": <uuid|null>, "course_name": <text>, "tees": <text>,
--    "holes": <int>, "fecha": <date>, "formato_juego": <text>, "modo_juego": <text>, "hcp_pct": <int>}
--   Si el torneo ya tiene tarjetas de grupo, la nueva tiene que calzar con alguna en cancha, hoyos, tees, fecha, modo
--   y % de hándicap, y en formato (el mismo, o stroke play si esa es de match play): si no → `tarjeta-distinta`.
--
-- Devuelve {"ok": true, "group_id", "ronda_libre_id", "nombre"} o {"ok": false, "motivo"} sin escribir nada.
-- Motivos: torneo-no-en-juego, torneo-varias-rondas, grupo-no-existe, grupo-con-tarjeta, grupo-con-jugadores,
-- nombre-repetido, tarjeta-distinta, codigo-repetido (la app reintenta con otro código).
CREATE OR REPLACE FUNCTION public.crear_grupo_en_juego(
  p_tournament_id uuid,
  p_group_id uuid,
  p_nombre text,
  p_tarjeta jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tstatus  text;
  v_rondas   integer;
  v_card     uuid;
  v_grupo    uuid;
  v_nombre   text;
  v_previa   uuid;
  v_n        integer;
BEGIN
  -- ── Forma de los parámetros ───────────────────────────────────────────────────────────────────────────────
  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: p_tournament_id es obligatorio';
  END IF;
  IF (p_group_id IS NULL) = (p_nombre IS NULL) THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: grupo nuevo lleva nombre; un grupo existente, no';
  END IF;
  IF p_nombre IS NOT NULL AND (btrim(p_nombre) = '' OR char_length(btrim(p_nombre)) > 60) THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: nombre vacío o de más de 60 caracteres';
  END IF;
  IF jsonb_typeof(p_tarjeta) IS DISTINCT FROM 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_tarjeta) k
                 WHERE k NOT IN ('codigo', 'creador_id', 'course_id', 'course_name', 'tees', 'holes', 'fecha',
                                 'formato_juego', 'modo_juego', 'hcp_pct'))
     OR jsonb_typeof(p_tarjeta->'codigo') IS DISTINCT FROM 'string' OR btrim(p_tarjeta->>'codigo') = ''
     OR jsonb_typeof(p_tarjeta->'creador_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'course_id') NOT IN ('string', 'null') OR NOT (p_tarjeta ? 'course_id')
     OR jsonb_typeof(p_tarjeta->'course_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'tees') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'holes') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_tarjeta->'fecha') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'formato_juego') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'modo_juego') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_tarjeta->'hcp_pct') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: p_tarjeta mal formada';
  END IF;

  -- ── Locks 1-2: torneo ─────────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('grupos:' || p_tournament_id::text, 0));
  SELECT t.status, COALESCE(t.total_rounds, 1) INTO v_tstatus, v_rondas
    FROM public.tournaments t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: el torneo % no existe', p_tournament_id;
  END IF;
  IF v_tstatus IS DISTINCT FROM 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-no-en-juego');
  END IF;
  IF v_rondas > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-varias-rondas');
  END IF;

  -- ── El grupo ──────────────────────────────────────────────────────────────────────────────────────────────
  IF p_group_id IS NOT NULL THEN
    SELECT g.name, g.ronda_libre_id INTO v_nombre, v_previa
      FROM public.tournament_groups g WHERE g.id = p_group_id AND g.tournament_id = p_tournament_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-no-existe');
    END IF;
    IF v_previa IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-con-tarjeta');
    END IF;
    -- Uno con inscritos (p. ej. solo pendientes, que el inicio no materializa) no se arma acá: sus inscritos
    -- tendrían que entrar por `colocar_inscrito_en_grupo`, con sus reglas. Falla cerrado.
    IF EXISTS (SELECT 1 FROM public.tournament_group_players gp WHERE gp.group_id = p_group_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-con-jugadores');
    END IF;
  ELSE
    v_nombre := btrim(p_nombre);
    IF EXISTS (SELECT 1 FROM public.tournament_groups g
                WHERE g.tournament_id = p_tournament_id AND lower(btrim(g.name)) = lower(v_nombre)) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'nombre-repetido');
    END IF;
  END IF;

  -- La tarjeta juega lo mismo que las del inicio (`tarjetaDeGrupoDeTorneo`). Si ya hay tarjetas de grupo, la nueva
  -- calza con alguna; si no, algo cambió en el torneo desde el inicio y no se adivina cuál vale.
  IF EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.tournament_id = p_tournament_id AND g.ronda_libre_id IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.tournament_groups g JOIN public.rondas_libres rl ON rl.id = g.ronda_libre_id
        WHERE g.tournament_id = p_tournament_id
          AND rl.course_id IS NOT DISTINCT FROM (p_tarjeta->>'course_id')::uuid
          AND rl.holes IS NOT DISTINCT FROM (p_tarjeta->>'holes')::integer
          AND rl.tees IS NOT DISTINCT FROM p_tarjeta->>'tees'
          AND rl.fecha IS NOT DISTINCT FROM (p_tarjeta->>'fecha')::date
          AND rl.modo_juego IS NOT DISTINCT FROM p_tarjeta->>'modo_juego'
          AND rl.hcp_pct IS NOT DISTINCT FROM (p_tarjeta->>'hcp_pct')::smallint
          AND (rl.formato_juego = p_tarjeta->>'formato_juego'
               OR (rl.formato_juego = 'match_play' AND p_tarjeta->>'formato_juego' = 'stroke_play'))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-distinta');
  END IF;

  -- ── Escrituras ────────────────────────────────────────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.rondas_libres (codigo, creador_id, course_id, course_name, tees, holes, fecha, estado,
                                      formato_juego, modo_juego, hcp_pct)
    VALUES (btrim(p_tarjeta->>'codigo'), (p_tarjeta->>'creador_id')::uuid, (p_tarjeta->>'course_id')::uuid,
            p_tarjeta->>'course_name', p_tarjeta->>'tees', (p_tarjeta->>'holes')::integer, (p_tarjeta->>'fecha')::date,
            'en_curso', p_tarjeta->>'formato_juego', p_tarjeta->>'modo_juego', (p_tarjeta->>'hcp_pct')::smallint)
    RETURNING id INTO v_card;
  EXCEPTION WHEN unique_violation THEN
    -- rondas_libres_codigo_key: el código aleatorio ya existe. Nada quedó escrito; la app pide otro.
    RETURN jsonb_build_object('ok', false, 'motivo', 'codigo-repetido');
  END;

  IF p_group_id IS NULL THEN
    INSERT INTO public.tournament_groups (tournament_id, name, sort_order, ronda_libre_id)
    SELECT p_tournament_id, v_nombre, COALESCE(max(g.sort_order) + 1, 0), v_card
      FROM public.tournament_groups g WHERE g.tournament_id = p_tournament_id
    RETURNING id INTO v_grupo;
  ELSE
    UPDATE public.tournament_groups g SET ronda_libre_id = v_card
     WHERE g.id = p_group_id AND g.tournament_id = p_tournament_id AND g.ronda_libre_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'crear_grupo_en_juego: enlazar la tarjeta actualizó % grupos', v_n;
    END IF;
    v_grupo := p_group_id;
  END IF;

  -- ── Invariantes: un grupo sin inscritos, enlazado a una tarjeta en curso, vacía y sin equipo ───────────────
  IF (SELECT count(*) FROM public.tournament_groups g WHERE g.ronda_libre_id = v_card) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.id = v_grupo AND g.ronda_libre_id = v_card)
     OR EXISTS (SELECT 1 FROM public.tournament_group_players gp WHERE gp.group_id = v_grupo)
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card)
     OR EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_card) THEN
    RAISE EXCEPTION 'crear_grupo_en_juego: el grupo nuevo no quedó vacío y enlazado a su tarjeta';
  END IF;

  RETURN jsonb_build_object('ok', true, 'group_id', v_grupo, 'ronda_libre_id', v_card, 'nombre', v_nombre);
END;
$$;

-- ── 2. Borrar ────────────────────────────────────────────────────────────────────────────────────────────────
-- Borra un grupo del torneo en juego y su tarjeta, solo si está vacío: sin inscritos (de ningún estado, también
-- WD/DQ y sin aprobar), sin filas en su tarjeta y sin golpes de equipo. Un grupo sin tarjeta se borra igual.
-- Devuelve {"ok": true, "ronda_libre_id": <uuid|null>} o {"ok": false, "motivo"} sin escribir nada.
-- Motivos: torneo-no-en-juego, torneo-varias-rondas, grupo-no-existe, grupo-con-jugadores, grupo-con-golpes,
-- tarjeta-cerrada, tarjeta-con-timba.
CREATE OR REPLACE FUNCTION public.borrar_grupo_en_juego(
  p_tournament_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tstatus text;
  v_rondas  integer;
  v_card    uuid;
  v_estado  text;
  v_n       integer;
BEGIN
  IF p_tournament_id IS NULL OR p_group_id IS NULL THEN
    RAISE EXCEPTION 'borrar_grupo_en_juego: p_tournament_id y p_group_id son obligatorios';
  END IF;

  -- ── Locks 1-2: torneo ─────────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('grupos:' || p_tournament_id::text, 0));
  SELECT t.status, COALESCE(t.total_rounds, 1) INTO v_tstatus, v_rondas
    FROM public.tournaments t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'borrar_grupo_en_juego: el torneo % no existe', p_tournament_id;
  END IF;
  IF v_tstatus IS DISTINCT FROM 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-no-en-juego');
  END IF;
  IF v_rondas > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-varias-rondas');
  END IF;

  SELECT g.ronda_libre_id INTO v_card
    FROM public.tournament_groups g WHERE g.id = p_group_id AND g.tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-no-existe');
  END IF;

  -- ── Lock 3: su tarjeta, sus filas y su equipo ─────────────────────────────────────────────────────────────
  IF v_card IS NOT NULL THEN
    SELECT rl.estado INTO v_estado FROM public.rondas_libres rl WHERE rl.id = v_card FOR UPDATE;
    PERFORM 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card ORDER BY j.id FOR UPDATE;
    PERFORM 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_card ORDER BY re.id FOR UPDATE;
  END IF;

  -- ── Vacío, bajo lock ──────────────────────────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.tournament_group_players gp WHERE gp.group_id = p_group_id)
     OR (v_card IS NOT NULL AND EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-con-jugadores');
  END IF;
  IF v_card IS NOT NULL THEN
    -- Golpes de equipo (bola compartida) sin filas no deberían existir; si existen, no se borran.
    IF EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_card
                AND public.tarjeta_tiene_anotaciones(re.scores)) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-con-golpes');
    END IF;
    IF v_estado IS DISTINCT FROM 'en_curso' THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-cerrada');
    END IF;
    IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = v_card AND rl.reglas_juego IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.ronda_libre_puntitos x WHERE x.ronda_id = v_card)
       OR EXISTS (SELECT 1 FROM public.ronda_libre_retiros x WHERE x.ronda_id = v_card)
       OR EXISTS (SELECT 1 FROM public.ronda_libre_juego_orden x WHERE x.ronda_id = v_card) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-con-timba');
    END IF;
    IF EXISTS (SELECT 1 FROM public.match_pairings x WHERE x.ronda_id = v_card) THEN
      RAISE EXCEPTION 'borrar_grupo_en_juego: la tarjeta tiene match_pairings';
    END IF;
    -- Una tarjeta compartida por dos grupos sería una corrupción: borrarla dejaría al otro sin tarjeta.
    IF (SELECT count(*) FROM public.tournament_groups g WHERE g.ronda_libre_id = v_card) <> 1 THEN
      RAISE EXCEPTION 'borrar_grupo_en_juego: la tarjeta % es de más de un grupo', v_card;
    END IF;
  END IF;

  -- ── Escrituras: el grupo (suelta la FK sin cascada) y después su tarjeta (arrastra un equipo vacío) ─────────
  DELETE FROM public.tournament_groups g WHERE g.id = p_group_id AND g.tournament_id = p_tournament_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'borrar_grupo_en_juego: el grupo borró % filas', v_n;
  END IF;
  IF v_card IS NOT NULL THEN
    DELETE FROM public.rondas_libres rl WHERE rl.id = v_card;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'borrar_grupo_en_juego: la tarjeta borró % filas', v_n;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ronda_libre_id', v_card);
END;
$$;

-- Privadas para el cliente: solo la ruta del servidor (service role) las llama.
REVOKE ALL ON FUNCTION public.crear_grupo_en_juego(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_grupo_en_juego(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.borrar_grupo_en_juego(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_grupo_en_juego(uuid, uuid) TO service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, 'public.crear_grupo_en_juego(uuid,uuid,text,jsonb)', 'EXECUTE')
       OR has_function_privilege(r, 'public.borrar_grupo_en_juego(uuid,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar una RPC de grupo en juego', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.crear_grupo_en_juego(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.borrar_grupo_en_juego(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role no puede ejecutar las RPC de grupo en juego';
  END IF;
END $$;
