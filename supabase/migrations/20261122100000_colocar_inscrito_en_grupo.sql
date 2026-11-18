-- Gestión de jugadores con el torneo EN JUEGO (#814 · PR2): agregar, mover y borrar a un inscrito en una sola
-- primitiva, `colocar_inscrito_en_grupo`. Plan: docs/superpowers/plans/2026-11-18-gestion-en-juego-814.md (D1-D14).
--
-- La app planifica con las funciones puras de src/golf/torneo/gestion-en-juego.ts (`motivoParaNoColocar`) y esta RPC
-- solo escribe: re-verifica lo que el plan leyó (control optimista) y vuelve a evaluar, BAJO LOCK, todo lo que
-- depende de los golpes (el scorer puede anotar entre el plan y la escritura). Si cambias una regla acá, cambia
-- `motivoParaNoColocar` (y viceversa): los códigos de `motivo` son los de `CodigoMotivoNoColocar`, más los que solo
-- existen bajo lock (conflicto, torneo-no-en-juego, torneo-varias-rondas, tarjeta-cerrada, tarjeta-con-timba,
-- grupo-sin-tarjeta, cupo-lleno). `mismo-grupo` es de `CodigoMotivoNoColocar` y también se evalúa bajo lock.
--
-- Mover = UPDATE ronda_libre_jugadores.ronda_id: la fila conserva su id, así que viajan sus golpes, su
-- ronda_libre_scores_orden y el enlace tournament_group_players.jugador_ronda_id. FK hacia ronda_libre_jugadores
-- (todas, revisadas en supabase/schema.sql al 18-nov-2026):
--   · tournament_group_players.jugador_ronda_id  (NO ACTION)  se reescribe en la misma transacción;
--   · ronda_equipo_jugadores.jugador_id           (CASCADE)    se mueve al equipo destino;
--   · ronda_libre_scores_orden.jugador_id         (CASCADE)    sin ronda_id: viaja con la fila;
--   · match_pairings.jugador_a_id / jugador_b_id  (CASCADE)    los torneos no los crean: si hay, RAISE;
--   · ronda_libre_puntitos / ronda_libre_retiros  (CASCADE)    timba, con ronda_id propio: motivo tarjeta-con-timba;
--   (ronda_libre_juego_orden es de la timba, por ronda: lo mismo). Hoy una tarjeta de torneo no puede tener timba
--   (reglas_juego solo lo escribe /api/ronda-libre/create; el inicio del torneo no), así que es una defensa.
--
-- Locks, en este orden (compatible con editar_handicap_inscrito players → rlj → re, con el scorer y el cierre
-- ronda → jugador de 20261118120000, y con eliminar_cuenta tournaments → rondas_libres → players → rlj):
--   1. pg_advisory_xact_lock('grupos:'||torneo): dos gestiones del mismo torneo no se cruzan;
--   2. tournaments FOR UPDATE (no FOR SHARE: con D12 se llama a asegurar_tarjeta_vigente, que toma FOR UPDATE, y
--      subir de SHARE a UPDATE en la misma transacción es un deadlock con otra alta). Es el lock de enroll_player:
--      el cupo se cuenta atómico. Exige status = 'in_progress';
--   3. rondas_libres de las tarjetas involucradas, ORDER BY id FOR NO KEY UPDATE. No FOR SHARE: en match play la
--      RPC reescribe formato_juego, y subir de SHARE a UPDATE con el scorer adentro (rl FOR SHARE → rlj FOR UPDATE)
--      es un deadlock. Con NO KEY UPDATE el scorer individual (upsert_ronda_libre_scores) y el cierre esperan en rl,
--      antes de tomar nada que esta RPC necesite; los inserts con FK a rondas_libres (FOR KEY SHARE) no esperan. El
--      scorer de equipos (upsert_ronda_equipos_scores) no toca rl: bloquea solo su fila de ronda_equipos (FOR UPDATE
--      OF re) y espera en el lock 6, sin tener nada que esta RPC pida antes. Exige estado = 'en_curso';
--   4. players del inscrito y de los grupos involucrados, ORDER BY id FOR NO KEY UPDATE; después las `rounds` del
--      inscrito FOR UPDATE (un golpe de su tarjeta individual, hole_scores, espera o queda visto);
--   5. ronda_libre_jugadores de ambas tarjetas, ORDER BY id FOR UPDATE: serializa contra el scorer, y un
--      dispositivo con la tarjeta vieja recibe RONDA_NOT_FOUND (la fila ya no es de esa ronda);
--   6. ronda_equipos de ambas tarjetas, ORDER BY id FOR UPDATE.
--
-- Falla ABIERTA de los triggers grupos_fijos_* (20261117120000): esta función es SECURITY DEFINER y corre como
-- postgres, exenta de esas guardas. Las reemplaza adentro: exige torneo in_progress con las tarjetas en curso,
-- valida que cada grupo sea del torneo y deja verificado al final el enlace inscrito ↔ fila ↔ tarjeta de cada grupo
-- tocado. Solo la ejecuta service_role (la ruta valida sesión y organizer_id).
--
-- Prueba: scripts/ci/pruebas-sql/colocar-inscrito-en-grupo.sql.
-- Rollback: supabase/migrations/rollback/20261122100000_colocar_inscrito_en_grupo_rollback.sql

-- ── 1. "¿La tarjeta tiene algo anotado?" ─────────────────────────────────────────────────────────────────────
-- Espejo SQL de `tarjetaTieneAnotaciones` (src/golf/torneo/gestion-en-juego.ts): cualquier score guardado,
-- también el CONCEDE (-1) y el 0. Diferencia deliberada: TS mira solo los hoyos de la ronda; acá cuenta cualquier
-- clave con valor numérico. Es un superconjunto (una clave fuera de la ronda cuenta), así que falla cerrado y no
-- depende de que la app mande bien los hoyos.
CREATE OR REPLACE FUNCTION public.tarjeta_tiene_anotaciones(p_scores jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(p_scores) = 'object'
     AND EXISTS (SELECT 1 FROM jsonb_each(p_scores) e WHERE jsonb_typeof(e.value) = 'number');
$$;

REVOKE ALL ON FUNCTION public.tarjeta_tiene_anotaciones(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarjeta_tiene_anotaciones(jsonb) TO service_role;

-- ── 2. RPC ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Operación (la deduce la RPC del grupo actual del inscrito, bajo lock):
--   agregar  p_grupo_destino no null, el inscrito sin grupo;
--   mover    p_grupo_destino no null, el inscrito en otro grupo;
--   borrar   p_grupo_destino null y p_borrar_inscrito = true: sale de su tarjeta (si la tiene) y se borra `players`.
--
-- Parámetros (jsonb con formato EXACTO; un parámetro mal formado → RAISE):
--   p_esperado  lo que el plan leyó. Si al bloquear no calza → {"ok": false, "motivo": "conflicto"} sin escribir:
--     {"inscrito": <huella> + {"grupo": <uuid|null>},
--      "grupos": [{"group_id": <uuid>, "ronda_libre_id": <uuid|null>, "jugadores": [<huella> + {"player_id": <uuid>}]}]}
--     huella = {"status": <text>, "handicap": <number|null>, "tee_id": <uuid|null>, "genero": <text|null>,
--               "category_id": <uuid|null>} = players.status, handicap_at_registration, tee_id, genero, category_id:
--     lo que entra al hándicap de equipo (el tee de cada jugador sale de tee_id o de su categoría y género).
--     `grupos` trae EXACTAMENTE el grupo de origen y el de destino (los que no son null); `jugadores` son todos los
--     inscritos del grupo (tournament_group_players), en cualquier orden.
--   p_fila      la fila de tarjeta a crear cuando el inscrito llega a un grupo sin fila (agregar, o D12):
--     {"nombre": <text>, "handicap": <number|null>, "handicap_de_inscripcion": <boolean>}
--     (`filaDeHandicapDeTorneo`; en modo raw, sin handicap ni handicap_de_inscripcion). user_id sale de players.
--     null en cualquier otro caso.
--   p_equipos   formato por equipos: un hándicap por cada grupo tocado cuya tarjeta queda con filas:
--     [{"group_id": <uuid>, "handicap_equipo": <number|null>, "handicap_equipo_juego": <integer|null>}]
--     Bola compartida: no null cuando el equipo queda con >= min jugadores que COMPITEN (el mismo conteo
--     `miembros` de `motivoParaNoColocar`); mejor bola: ambos null. Fuera de equipos: [].
--   p_politica  la regla del formato, armada por la app desde las fuentes canónicas de TS (sin listas de formatos
--     en SQL): {"formato": <text>, "equipo": isTeamFormat, "bola_compartida": isSharedBallFormat,
--     "match_play": isMatchPlayFormat, "al_pie_con_retirado": <foursome: un WD/DQ manda la pareja al pie>,
--     "jugadores_por_equipo": jugadoresPorEquipo ({"min","max"} | null), "jugadores_por_match": JUGADORES_POR_MATCH}
--
-- Devuelve:
--   {"ok": true, "operacion": "agregar"|"mover"|"borrar", "jugador_ronda_id": <uuid|null>, "aprobado": <bool>,
--    "retirados_quitados": <n>, "equipo_creado": <bool>, "equipo_borrado": <bool>}
--   {"ok": false, "motivo": <código>, "ofrece_retirar": <bool>}  no escribió nada.
--
-- El formato de cada tarjeta tocada lo decide la RPC, no el cliente (match play: un par anota match, otro tamaño
-- stroke play; espejo de `formatoDeLaTarjetaDelGrupo`, src/golf/ronda-libre/formato-tarjeta-de-grupo.ts). Así un
-- plan equivocado no puede dejar un par en stroke play ni un trío en match play.
CREATE OR REPLACE FUNCTION public.colocar_inscrito_en_grupo(
  p_tournament_id uuid,
  p_player_id uuid,
  p_grupo_destino uuid,
  p_esperado jsonb,
  p_fila jsonb,
  p_equipos jsonb,
  p_politica jsonb,
  p_borrar_inscrito boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Política del formato.
  v_equipo      boolean;
  v_compartida  boolean;
  v_match       boolean;
  v_pie_ret     boolean;
  v_min         integer;
  v_max         integer;
  v_jpm         integer;
  v_formato     text;
  v_equipos     jsonb := COALESCE(p_equipos, '[]'::jsonb);
  v_card        uuid;
  v_fmt         text;
  v_total_rondas integer;
  -- Estado bajo lock.
  v_tstatus     text;
  v_max_players integer;
  v_status      text;
  v_user_id     uuid;
  v_estado      text;   -- compite | retirado | sin-aprobar
  v_op          text;
  v_origen      uuid;
  v_o_card      uuid;
  v_d_card      uuid;
  v_cards       uuid[];
  v_grupos      uuid[];
  v_jrid        uuid;
  v_ins_golpes  boolean := false;
  v_o_miembros  integer := 0;
  v_o_filas     integer := 0;
  v_o_golpes    boolean := false;
  v_d_miembros  integer := 0;
  v_d_filas     integer := 0;
  v_d_golpes    boolean := false;
  v_quedan      integer;
  v_filas_q     integer;
  v_sale_m      integer;
  v_sale_f      integer;
  v_aprobado    boolean := false;
  v_retirados   integer := 0;
  v_ret_gp      uuid[];
  v_ret_jr      uuid[];
  v_eq_creado   boolean := false;
  v_eq_borrado  boolean := false;
  v_equipo_id   uuid;
  v_n           integer;
  v_e           jsonb;
  v_k           text;
  v_r           jsonb;
  c_fuera       CONSTANT text[] := ARRAY['withdrawn', 'disqualified'];  -- = JUGADOR_FUERA_STATUSES (tournament-status.ts)
BEGIN
  -- ── Forma de los parámetros ───────────────────────────────────────────────────────────────────────────────
  IF p_tournament_id IS NULL OR p_player_id IS NULL OR p_borrar_inscrito IS NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_tournament_id, p_player_id y p_borrar_inscrito son obligatorios';
  END IF;
  IF (p_grupo_destino IS NULL) <> p_borrar_inscrito THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: sin grupo destino solo se borra (y borrar no lleva destino)';
  END IF;
  IF jsonb_typeof(p_politica) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_politica->'formato') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_politica->'equipo') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'bola_compartida') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'match_play') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'al_pie_con_retirado') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'jugadores_por_match') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_politica->'jugadores_por_equipo') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica mal formada';
  END IF;
  v_formato    := p_politica->>'formato';
  v_equipo     := (p_politica->>'equipo')::boolean;
  v_compartida := (p_politica->>'bola_compartida')::boolean;
  v_match      := (p_politica->>'match_play')::boolean;
  v_pie_ret    := (p_politica->>'al_pie_con_retirado')::boolean;
  v_jpm        := (p_politica->>'jugadores_por_match')::integer;
  IF v_equipo THEN
    IF jsonb_typeof(p_politica->'jugadores_por_equipo'->'min') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_politica->'jugadores_por_equipo'->'max') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica de equipo sin jugadores_por_equipo';
    END IF;
    v_min := (p_politica->'jugadores_por_equipo'->>'min')::integer;
    v_max := (p_politica->'jugadores_por_equipo'->>'max')::integer;
  ELSIF jsonb_typeof(p_politica->'jugadores_por_equipo') <> 'null' THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: jugadores_por_equipo fuera de un formato por equipos';
  END IF;
  IF COALESCE(v_formato, '') = '' OR v_jpm IS NULL OR v_jpm < 1 OR (v_equipo AND (v_min < 1 OR v_max < v_min))
     OR (v_compartida AND NOT v_equipo) OR (v_match AND v_equipo) OR (v_pie_ret AND NOT v_compartida) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica incoherente';
  END IF;
  IF jsonb_typeof(v_equipos) <> 'array' THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos debe ser array';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
              WHERE jsonb_typeof(e) <> 'object' OR NOT (e ? 'group_id') OR NOT (e ? 'handicap_equipo')
                 OR NOT (e ? 'handicap_equipo_juego')
                 OR jsonb_typeof(e->'group_id') <> 'string'
                 OR jsonb_typeof(e->'handicap_equipo') NOT IN ('number', 'null')
                 OR jsonb_typeof(e->'handicap_equipo_juego') NOT IN ('number', 'null'))
     OR (SELECT count(*) FROM jsonb_array_elements(v_equipos))
        <> (SELECT count(DISTINCT e->>'group_id') FROM jsonb_array_elements(v_equipos) e) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos mal formado o con grupos repetidos';
  END IF;
  IF p_fila IS NOT NULL AND (
       jsonb_typeof(p_fila) <> 'object'
       OR jsonb_typeof(p_fila->'nombre') IS DISTINCT FROM 'string' OR btrim(p_fila->>'nombre') = ''
       OR (p_fila ? 'handicap' AND jsonb_typeof(p_fila->'handicap') NOT IN ('number', 'null'))
       OR (p_fila ? 'handicap_de_inscripcion' AND jsonb_typeof(p_fila->'handicap_de_inscripcion') <> 'boolean')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_fila) k WHERE k NOT IN ('nombre', 'handicap', 'handicap_de_inscripcion'))) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_fila mal formada';
  END IF;
  IF jsonb_typeof(p_esperado) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_esperado->'inscrito') IS DISTINCT FROM 'object'
     OR NOT (p_esperado->'inscrito' ? 'status') OR NOT (p_esperado->'inscrito' ? 'handicap')
     OR NOT (p_esperado->'inscrito' ? 'grupo') OR NOT (p_esperado->'inscrito' ? 'tee_id')
     OR NOT (p_esperado->'inscrito' ? 'genero') OR NOT (p_esperado->'inscrito' ? 'category_id')
     OR jsonb_typeof(p_esperado->'grupos') IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_esperado->'grupos') g
                 WHERE jsonb_typeof(g) <> 'object' OR jsonb_typeof(g->'group_id') IS DISTINCT FROM 'string'
                    OR jsonb_typeof(g->'ronda_libre_id') NOT IN ('string', 'null')
                    OR jsonb_typeof(g->'jugadores') IS DISTINCT FROM 'array'
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements(g->'jugadores') j
                                WHERE jsonb_typeof(j) <> 'object' OR NOT (j ? 'player_id') OR NOT (j ? 'status')
                                   OR NOT (j ? 'handicap') OR NOT (j ? 'tee_id') OR NOT (j ? 'genero')
                                   OR NOT (j ? 'category_id'))) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_esperado mal formado';
  END IF;

  -- ── Locks 1-2: torneo ─────────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('grupos:' || p_tournament_id::text, 0));
  SELECT t.status, t.max_players, COALESCE(t.total_rounds, 1) INTO v_tstatus, v_max_players, v_total_rondas
    FROM public.tournaments t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: el torneo % no existe', p_tournament_id;
  END IF;
  IF v_tstatus IS DISTINCT FROM 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-no-en-juego', 'ofrece_retirar', false);
  END IF;
  -- Varias rondas: cada ronda tiene sus tarjetas y el plan (#814) cubre solo torneos de una ronda.
  IF v_total_rondas > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-varias-rondas', 'ofrece_retirar', false);
  END IF;

  -- Grupo de origen y tarjetas. Otros escritores de tournament_group_players: el inicio (startTournament enlaza
  -- con el torneo todavía open y lo pone in_progress al final, con un UPDATE que espera este lock), cancelar (solo
  -- draft/open, lo valida la ruta; no cambia el estado antes de borrar, pero nunca corre con el torneo in_progress)
  -- y la gestión de grupos del cliente (authenticated: los triggers grupos_fijos_* la cortan en juego). Ninguno
  -- escribe con el torneo in_progress, que esta RPC exige bajo FOR UPDATE.
  IF (SELECT count(*) FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id) > 1 THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: el inscrito está en más de un grupo';
  END IF;
  SELECT gp.group_id INTO v_origen FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
  IF v_origen IS NOT NULL AND v_origen IS NOT DISTINCT FROM p_grupo_destino THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mismo-grupo', 'ofrece_retirar', false);
  END IF;
  v_op := CASE WHEN p_borrar_inscrito THEN 'borrar' WHEN v_origen IS NULL THEN 'agregar' ELSE 'mover' END;
  v_grupos := ARRAY(SELECT x FROM unnest(ARRAY[v_origen, p_grupo_destino]) x WHERE x IS NOT NULL);
  IF (SELECT count(*) FROM public.tournament_groups g WHERE g.id = ANY (v_grupos) AND g.tournament_id = p_tournament_id)
     <> cardinality(v_grupos) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: algún grupo no es del torneo';
  END IF;
  SELECT g.ronda_libre_id INTO v_o_card FROM public.tournament_groups g WHERE g.id = v_origen;
  SELECT g.ronda_libre_id INTO v_d_card FROM public.tournament_groups g WHERE g.id = p_grupo_destino;
  IF (v_origen IS NOT NULL AND v_o_card IS NULL) OR (p_grupo_destino IS NOT NULL AND v_d_card IS NULL) THEN
    -- Un grupo creado tras el inicio sin tarjeta (lo resuelve el PR4): no se toca hasta que la tenga.
    RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-sin-tarjeta', 'ofrece_retirar', false);
  END IF;
  v_cards := ARRAY(SELECT x FROM unnest(ARRAY[v_o_card, v_d_card]) x WHERE x IS NOT NULL);

  -- ── Lock 3: tarjetas en curso ─────────────────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) ORDER BY rl.id FOR NO KEY UPDATE;
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) AND rl.estado IS DISTINCT FROM 'en_curso') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-cerrada', 'ofrece_retirar', false);
  END IF;
  -- La política tiene que ser la del torneo que armó estas tarjetas (`formatoDeLaTarjetaDelGrupo`).
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards)
              AND rl.formato_juego IS DISTINCT FROM v_formato AND NOT (v_match AND rl.formato_juego = 'stroke_play')) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica no es la del formato de las tarjetas';
  END IF;
  -- Timba y match_pairings: sus filas guardan la ronda; mover o borrar las dejaría apuntando mal. Falla cerrado.
  -- Timba: motivo (el organizador ve por qué). match_pairings: los torneos no los crean, así que es una corrupción.
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) AND rl.reglas_juego IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.ronda_libre_puntitos x WHERE x.ronda_id = ANY (v_cards))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_retiros x WHERE x.ronda_id = ANY (v_cards))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_juego_orden x WHERE x.ronda_id = ANY (v_cards)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-con-timba', 'ofrece_retirar', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_pairings x WHERE x.ronda_id = ANY (v_cards)) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: la tarjeta tiene match_pairings';
  END IF;

  -- ── Lock 4: players ───────────────────────────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.players p
   WHERE p.id = p_player_id
      OR p.id IN (SELECT gp.player_id FROM public.tournament_group_players gp WHERE gp.group_id = ANY (v_grupos))
   ORDER BY p.id FOR NO KEY UPDATE;
  SELECT p.status, p.user_id INTO v_status, v_user_id
    FROM public.players p WHERE p.id = p_player_id AND p.tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto', 'ofrece_retirar', false);
  END IF;

  -- Su tarjeta individual (`rounds`) FOR UPDATE: un golpe que /api/game guarda en hole_scores toma FOR KEY SHARE
  -- de esa fila (FK), así que espera a esta transacción o esta espera a él y después lo ve (#828).
  PERFORM 1 FROM public.rounds r WHERE r.tournament_id = p_tournament_id AND r.player_id = p_player_id
   ORDER BY r.id FOR UPDATE;

  -- ── Locks 5-6: filas de tarjeta y equipos ─────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = ANY (v_cards) ORDER BY j.id FOR UPDATE;
  PERFORM 1 FROM public.ronda_equipos re WHERE re.ronda_id = ANY (v_cards) ORDER BY re.id FOR UPDATE;

  -- ── Control optimista ─────────────────────────────────────────────────────────────────────────────────────
  IF (p_esperado->'inscrito'->>'status') IS DISTINCT FROM v_status
     OR (p_esperado->'inscrito'->>'grupo')::uuid IS DISTINCT FROM v_origen
     OR jsonb_build_object('handicap', p_esperado->'inscrito'->'handicap', 'tee_id', p_esperado->'inscrito'->'tee_id',
                           'genero', p_esperado->'inscrito'->'genero', 'category_id', p_esperado->'inscrito'->'category_id')
        IS DISTINCT FROM
        (SELECT jsonb_build_object('handicap', COALESCE(to_jsonb(p.handicap_at_registration), 'null'::jsonb),
                                   'tee_id', COALESCE(to_jsonb(p.tee_id), 'null'::jsonb),
                                   'genero', COALESCE(to_jsonb(p.genero), 'null'::jsonb),
                                   'category_id', COALESCE(to_jsonb(p.category_id), 'null'::jsonb))
           FROM public.players p WHERE p.id = p_player_id)
     OR jsonb_array_length(p_esperado->'grupos') <> cardinality(v_grupos)
     OR EXISTS (
          SELECT 1 FROM unnest(v_grupos) gid
           WHERE NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(p_esperado->'grupos') eg
              WHERE (eg->>'group_id')::uuid = gid
                AND (eg->>'ronda_libre_id')::uuid IS NOT DISTINCT FROM (SELECT g.ronda_libre_id FROM public.tournament_groups g WHERE g.id = gid)
                AND COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', (j->>'player_id')::uuid, 'status', j->'status', 'handicap', j->'handicap',
                                                                  'tee_id', j->'tee_id', 'genero', j->'genero', 'category_id', j->'category_id')
                                               ORDER BY (j->>'player_id')::uuid)
                                FROM jsonb_array_elements(eg->'jugadores') j), '[]'::jsonb)
                    = COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', p.id, 'status', to_jsonb(p.status),
                                                                    'handicap', COALESCE(to_jsonb(p.handicap_at_registration), 'null'::jsonb),
                                                                    'tee_id', COALESCE(to_jsonb(p.tee_id), 'null'::jsonb),
                                                                    'genero', COALESCE(to_jsonb(p.genero), 'null'::jsonb),
                                                                    'category_id', COALESCE(to_jsonb(p.category_id), 'null'::jsonb))
                                                 ORDER BY p.id)
                                  FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
                                 WHERE gp.group_id = gid), '[]'::jsonb))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto', 'ofrece_retirar', false);
  END IF;

  -- Cada fila de las tarjetas tocadas es de exactamente un inscrito de su grupo (si no, los conteos mienten).
  IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
              JOIN public.tournament_groups g ON g.ronda_libre_id = j.ronda_id
             WHERE j.ronda_id = ANY (v_cards)
               AND (SELECT count(*) FROM public.tournament_group_players gp
                     WHERE gp.jugador_ronda_id = j.id AND gp.group_id = g.id) <> 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tocada tiene filas sin inscrito de su grupo';
  END IF;
  IF v_compartida AND EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = ANY (v_cards)
                               GROUP BY re.ronda_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tiene más de un equipo';
  END IF;

  -- ── Estado, bajo lock ─────────────────────────────────────────────────────────────────────────────────────
  -- `estadoDelInscrito`.
  v_estado := CASE WHEN v_status = ANY (c_fuera) THEN 'retirado'
                   WHEN v_status = 'approved' THEN 'compite' ELSE 'sin-aprobar' END;
  SELECT gp.jugador_ronda_id INTO v_jrid FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
  IF v_jrid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid AND j.ronda_id = v_o_card) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: la fila del inscrito no es de la tarjeta de su grupo';
  END IF;
  IF v_estado = 'sin-aprobar' AND v_jrid IS NOT NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un inscrito sin aprobar tiene fila de tarjeta';
  END IF;
  -- Un WD/DQ puede no tener fila (se retiró antes del inicio y no se materializó); uno que compite, no.
  IF v_estado = 'compite' AND v_origen IS NOT NULL AND v_jrid IS NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: inscrito que compite en un grupo con tarjeta sin fila enlazada';
  END IF;

  -- InscritoAColocar.tieneGolpes: su fila del grupo y, sin grupo, su tarjeta individual del torneo (#828). Al
  -- borrar se mira la individual SIEMPRE (falla cerrado: borrar `players` arrastra sus rounds y hole_scores).
  -- Cualquier fila de hole_scores cuenta como anotación.
  v_ins_golpes := COALESCE((SELECT public.tarjeta_tiene_anotaciones(j.scores) FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid), false)
    OR ((v_origen IS NULL OR v_op = 'borrar') AND EXISTS (
          SELECT 1 FROM public.hole_scores hs JOIN public.rounds r ON r.id = hs.round_id
           WHERE r.tournament_id = p_tournament_id AND r.player_id = p_player_id));

  -- GrupoEnJuego de origen y destino: miembros = aprobados del grupo; filas = de su tarjeta; golpes = los del
  -- equipo en bola compartida, los de cualquier fila (también WD/DQ) en el resto.
  IF v_origen IS NOT NULL THEN
    SELECT count(*) INTO v_o_miembros FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
     WHERE gp.group_id = v_origen AND p.status = 'approved';
    SELECT count(*) INTO v_o_filas FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card;
    v_o_golpes := CASE WHEN v_compartida
      THEN EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_o_card AND public.tarjeta_tiene_anotaciones(re.scores))
      ELSE EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card AND public.tarjeta_tiene_anotaciones(j.scores)) END;
  END IF;
  IF p_grupo_destino IS NOT NULL THEN
    SELECT count(*) INTO v_d_miembros FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
     WHERE gp.group_id = p_grupo_destino AND p.status = 'approved';
    SELECT count(*) INTO v_d_filas FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card;
    v_d_golpes := CASE WHEN v_compartida
      THEN EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_d_card AND public.tarjeta_tiene_anotaciones(re.scores))
      ELSE EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card AND public.tarjeta_tiene_anotaciones(j.scores)) END;
  END IF;

  -- ── Motivos: espejo de `motivoParaNoColocar`, en el mismo orden ───────────────────────────────────────────
  -- D11.
  IF v_op <> 'borrar' AND v_estado = 'retirado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'retirado-no-se-mueve', 'ofrece_retirar', false);
  END IF;
  -- #828: sus golpes viven en su tarjeta individual.
  IF v_op = 'agregar' AND v_ins_golpes THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'agregar-con-tarjeta-individual', 'ofrece_retirar', false);
  END IF;
  IF v_op = 'borrar' AND v_estado = 'sin-aprobar' THEN
    IF v_ins_golpes THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-con-golpes', 'ofrece_retirar', false);
    END IF;
  ELSIF v_op = 'borrar' THEN
    -- D1 (en bola compartida los golpes son del equipo) y D8.
    IF v_ins_golpes OR (v_compartida AND v_o_golpes) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-con-golpes', 'ofrece_retirar', v_estado = 'compite');
    END IF;
    IF v_match AND v_o_golpes THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-match-en-juego', 'ofrece_retirar', v_estado = 'compite');
    END IF;
  END IF;

  IF NOT (v_op = 'borrar' AND v_estado = 'sin-aprobar') THEN
    IF v_match AND p_grupo_destino IS NOT NULL THEN
      IF v_d_filas + 1 > v_jpm THEN  -- D10
        RETURN jsonb_build_object('ok', false, 'motivo', 'match-play-grupo-lleno', 'ofrece_retirar', false);
      END IF;
      IF v_o_golpes OR v_d_golpes THEN  -- D6
        RETURN jsonb_build_object('ok', false, 'motivo', 'match-play-con-golpes', 'ofrece_retirar', false);
      END IF;
    END IF;
    -- D2.
    IF v_equipo AND NOT v_compartida AND v_op = 'mover' AND (v_o_golpes OR v_d_golpes) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'mejor-bola-con-golpes', 'ofrece_retirar', false);
    END IF;

    IF v_equipo THEN
      v_sale_m := CASE WHEN v_estado = 'compite' THEN 1 ELSE 0 END;
      v_sale_f := CASE WHEN v_jrid IS NULL THEN 0 ELSE 1 END;  -- sin aprobar, o WD/DQ sin fila
      IF p_grupo_destino IS NOT NULL THEN
        v_quedan := v_d_miembros + 1;
        IF v_quedan > v_max THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-lleno', 'ofrece_retirar', false);
        END IF;
        -- `equipoAlPie` por conteos y, en mejor bola, `estadoDelEquipoMejorBola` sobre la tarjeta real: un hoyo con
        -- golpes (> 0, `hoyoConGolpes`) de un DQ que ningún compañero no-DQ cubre deja al bando DQ.
        IF v_d_golpes AND (
             (v_pie_ret AND v_d_filas > v_d_miembros)
             OR (NOT v_compartida AND v_d_miembros = 0 AND v_d_filas > 0)
             OR (NOT v_compartida AND EXISTS (
                   SELECT 1
                     FROM public.ronda_libre_jugadores dq
                     JOIN public.tournament_group_players gq ON gq.jugador_ronda_id = dq.id
                     JOIN public.players pq ON pq.id = gq.player_id AND pq.status = 'disqualified'
                     CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(dq.scores) = 'object' THEN dq.scores ELSE '{}'::jsonb END) h
                    WHERE dq.ronda_id = v_d_card
                      AND jsonb_typeof(h.value) = 'number' AND (h.value)::numeric > 0
                      AND NOT EXISTS (
                        SELECT 1 FROM public.ronda_libre_jugadores ok
                          JOIN public.tournament_group_players gk ON gk.jugador_ronda_id = ok.id
                          JOIN public.players pk ON pk.id = gk.player_id AND pk.status IS DISTINCT FROM 'disqualified'
                         WHERE ok.ronda_id = v_d_card AND jsonb_typeof(ok.scores) = 'object'
                           AND jsonb_typeof(ok.scores->h.key) = 'number' AND (ok.scores->>h.key)::numeric > 0)))) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-al-pie', 'ofrece_retirar', false);
        END IF;
        IF v_compartida AND v_d_golpes AND v_quedan < v_min THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-incompleto', 'ofrece_retirar', false);
        END IF;
      END IF;
      IF v_origen IS NOT NULL THEN
        v_quedan := v_o_miembros - v_sale_m;
        v_filas_q := v_o_filas - v_sale_f;
        IF v_o_golpes AND v_sale_f > 0 AND v_filas_q <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-sin-miembros', 'ofrece_retirar', false);
        END IF;
        IF v_o_golpes AND v_sale_m > 0 AND v_quedan < (CASE WHEN v_compartida THEN v_min ELSE 1 END) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-incompleto', 'ofrece_retirar', false);
        END IF;
      END IF;
    END IF;
  END IF;

  -- D12: colocar a un sin aprobar lo aprueba. Ocupa cupo como un alta (`enroll_player`, "bloquear + ampliar"):
  -- sobre el cupo no entra; el organizador amplía max_players. Falla cerrado.
  IF v_op <> 'borrar' AND v_estado = 'sin-aprobar' THEN
    IF v_max_players IS NOT NULL AND v_max_players > 0
       AND (SELECT count(*) FROM public.players p WHERE p.tournament_id = p_tournament_id AND p.status = 'approved') >= v_max_players THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'cupo-lleno', 'ofrece_retirar', false);
    END IF;
  END IF;

  -- ── Escrituras ────────────────────────────────────────────────────────────────────────────────────────────
  IF v_op = 'borrar' THEN
    IF p_fila IS NOT NULL THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: borrar no lleva p_fila';
    END IF;
    DELETE FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> (CASE WHEN v_origen IS NULL THEN 0 ELSE 1 END) THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: tournament_group_players borró % filas', v_n;
    END IF;
    IF v_jrid IS NOT NULL THEN
      DELETE FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid AND j.ronda_id = v_o_card;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: la fila de tarjeta borró % filas', v_n;
      END IF;
    END IF;
    DELETE FROM public.players p WHERE p.id = p_player_id AND p.tournament_id = p_tournament_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: players borró % filas', v_n;
    END IF;
  ELSE
    -- D12.
    IF v_estado = 'sin-aprobar' THEN
      UPDATE public.players p SET status = 'approved', status_changed_at = now()
       WHERE p.id = p_player_id AND p.status = v_status;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: la aprobación actualizó % filas', v_n;
      END IF;
      v_aprobado := true;
    END IF;

    -- D13 (solo foursome, `al_pie_con_retirado`, como dice el plan): una pareja SIN golpes que se completa suelta
    -- TODAS sus filas WD/DQ (salen del grupo y de la tarjeta; la inscripción queda, retirada y sin grupo). Si
    -- quedara alguna, `estadoDelEquipoFoursome` mandaría la pareja al pie. En scramble y mejor bola el WD/DQ
    -- conserva su fila (comportamiento de hoy; cambiarlo es decisión de producto).
    IF v_pie_ret AND NOT v_d_golpes AND v_d_miembros + 1 >= v_min THEN
      SELECT COALESCE(array_agg(gp.id), '{}'), COALESCE(array_agg(gp.jugador_ronda_id) FILTER (WHERE gp.jugador_ronda_id IS NOT NULL), '{}')
        INTO v_ret_gp, v_ret_jr
        FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
       WHERE gp.group_id = p_grupo_destino AND p.status = ANY (c_fuera);
      v_retirados := cardinality(v_ret_gp);
      -- Sin golpes en el equipo, ninguna fila WD/DQ puede tener anotaciones; si las tiene, algo no calza: aborta.
      IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                  WHERE j.id = ANY (v_ret_jr) AND public.tarjeta_tiene_anotaciones(j.scores)) THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 iba a borrar una fila WD/DQ con anotaciones';
      END IF;
      IF v_retirados > 0 THEN
        DELETE FROM public.tournament_group_players gp WHERE gp.id = ANY (v_ret_gp);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> v_retirados THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 sacó % de % retirados del grupo', v_n, v_retirados;
        END IF;
        DELETE FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card AND j.id = ANY (v_ret_jr);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> cardinality(v_ret_jr) THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 borró % de % filas de retirados', v_n, cardinality(v_ret_jr);
        END IF;
      END IF;
    END IF;

    -- La fila del inscrito: la suya viaja (mover); si no tiene, se crea (agregar, o D12).
    IF v_jrid IS NOT NULL THEN
      IF p_fila IS NOT NULL THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_fila para un inscrito que ya tiene fila';
      END IF;
      UPDATE public.ronda_libre_jugadores j SET ronda_id = v_d_card WHERE j.id = v_jrid AND j.ronda_id = v_o_card;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: mover la fila actualizó % filas', v_n;
      END IF;
    ELSE
      IF p_fila IS NULL THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: falta p_fila para crear la fila del inscrito';
      END IF;
      INSERT INTO public.ronda_libre_jugadores (ronda_id, nombre, user_id, handicap, handicap_de_inscripcion, scores)
      VALUES (v_d_card, btrim(p_fila->>'nombre'), v_user_id, (p_fila->>'handicap')::numeric,
              COALESCE((p_fila->>'handicap_de_inscripcion')::boolean, false), '{}'::jsonb)
      RETURNING id INTO v_jrid;
    END IF;

    IF v_origen IS NOT NULL THEN
      UPDATE public.tournament_group_players gp SET group_id = p_grupo_destino, jugador_ronda_id = v_jrid
       WHERE gp.player_id = p_player_id AND gp.group_id = v_origen;
    ELSE
      INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id)
      VALUES (p_grupo_destino, p_player_id, v_jrid);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: tournament_group_players escribió % filas', v_n;
    END IF;

    -- Equipo destino: el grupo es el equipo (`materializeGroupScorecard`); si la tarjeta no lo tenía, se crea.
    IF v_equipo THEN
      SELECT re.id INTO v_equipo_id FROM public.ronda_equipos re WHERE re.ronda_id = v_d_card;
      IF v_equipo_id IS NULL THEN
        INSERT INTO public.ronda_equipos (ronda_id, nombre, scores)
        SELECT v_d_card, g.name, '{}'::jsonb FROM public.tournament_groups g WHERE g.id = p_grupo_destino
        RETURNING id INTO v_equipo_id;
        v_eq_creado := true;
      END IF;
      DELETE FROM public.ronda_equipo_jugadores rej WHERE rej.jugador_id = v_jrid;
      INSERT INTO public.ronda_equipo_jugadores (equipo_id, jugador_id, orden)
      SELECT v_equipo_id, v_jrid, COALESCE(max(rej.orden) + 1, 0)
        FROM public.ronda_equipo_jugadores rej WHERE rej.equipo_id = v_equipo_id;
    END IF;

    -- D12: su tarjeta individual (`rounds`), como cualquier aprobado (`ensureRound1Cards`).
    IF v_aprobado THEN
      v_r := public.asegurar_tarjeta_vigente(p_tournament_id, p_player_id);
      IF (v_r->>'ok')::boolean IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: asegurar_tarjeta_vigente: %', v_r;
      END IF;
    END IF;
  END IF;

  -- Equipo de origen sin filas: si no tiene golpes se borra; con golpes no puede pasar (motivo de arriba).
  IF v_equipo AND v_o_card IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card) THEN
    IF v_o_golpes THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: un equipo con golpes quedaría sin miembros';
    END IF;
    DELETE FROM public.ronda_equipos re WHERE re.ronda_id = v_o_card;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_eq_borrado := v_n > 0;
  END IF;

  -- Hándicap de los equipos que quedan con filas: exactamente los grupos tocados con filas.
  IF v_equipo THEN
    IF (SELECT count(*) FROM jsonb_array_elements(v_equipos)) <>
       (SELECT count(*) FROM unnest(v_grupos) gid
         WHERE EXISTS (SELECT 1 FROM public.tournament_groups g JOIN public.ronda_libre_jugadores j ON j.ronda_id = g.ronda_libre_id
                        WHERE g.id = gid))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
                   WHERE NOT ((e->>'group_id')::uuid = ANY (v_grupos))) THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos no trae exactamente los equipos tocados con filas';
    END IF;
    FOR v_e IN SELECT e FROM jsonb_array_elements(v_equipos) e LOOP
      -- Bola compartida: con >= min que compiten el hándicap es obligatorio. Mejor bola: siempre null.
      SELECT count(*) INTO v_n FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
       WHERE gp.group_id = (v_e->>'group_id')::uuid AND p.status = 'approved';
      IF (v_compartida AND v_n >= v_min AND (jsonb_typeof(v_e->'handicap_equipo') = 'null' OR jsonb_typeof(v_e->'handicap_equipo_juego') = 'null'))
         OR (NOT v_compartida AND (jsonb_typeof(v_e->'handicap_equipo') <> 'null' OR jsonb_typeof(v_e->'handicap_equipo_juego') <> 'null')) THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: hándicap de equipo inválido para el grupo %', v_e->>'group_id';
      END IF;
      UPDATE public.ronda_equipos re
         SET handicap_equipo = (v_e->>'handicap_equipo')::numeric,
             handicap_equipo_juego = (v_e->>'handicap_equipo_juego')::smallint
       WHERE re.ronda_id = (SELECT g.ronda_libre_id FROM public.tournament_groups g WHERE g.id = (v_e->>'group_id')::uuid);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: el equipo del grupo % actualizó % filas', v_e->>'group_id', v_n;
      END IF;
    END LOOP;
  ELSIF jsonb_array_length(v_equipos) > 0 THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos fuera de un formato por equipos';
  END IF;

  -- Formato de las tarjetas (match play: un par anota match, otro tamaño stroke play; espejo de
  -- `formatoDeLaTarjetaDelGrupo`). Lo decide la RPC con el conteo final de filas. Una tarjeta sin filas queda como
  -- está (nadie anota; al llegar alguien se recalcula). Una con anotaciones nunca cambia (D6/D8 lo impiden antes).
  IF v_match THEN
    FOREACH v_card IN ARRAY v_cards LOOP
      SELECT count(*) INTO v_n FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card;
      CONTINUE WHEN v_n = 0;
      v_fmt := CASE WHEN v_n = v_jpm THEN v_formato ELSE 'stroke_play' END;
      IF (SELECT rl.formato_juego FROM public.rondas_libres rl WHERE rl.id = v_card) IS DISTINCT FROM v_fmt THEN
        IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card AND public.tarjeta_tiene_anotaciones(j.scores)) THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: no se cambia el formato de una tarjeta con anotaciones';
        END IF;
        UPDATE public.rondas_libres rl SET formato_juego = v_fmt WHERE rl.id = v_card;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: no se pudo fijar el formato de la tarjeta %', v_card;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── Invariantes de cada grupo tocado (aborta si alguna falla) ─────────────────────────────────────────────
  -- integrantes >= miembros; cada aprobado del grupo enlazado a una fila de SU tarjeta; ninguna fila suelta.
  IF EXISTS (SELECT 1 FROM public.tournament_group_players gp
               JOIN public.tournament_groups g ON g.id = gp.group_id
               JOIN public.players p ON p.id = gp.player_id
              WHERE gp.group_id = ANY (v_grupos)
                AND (p.status = 'approved' OR gp.jugador_ronda_id IS NOT NULL)
                AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                                 WHERE j.id = gp.jugador_ronda_id AND j.ronda_id = g.ronda_libre_id))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                 JOIN public.tournament_groups g ON g.ronda_libre_id = j.ronda_id
                WHERE j.ronda_id = ANY (v_cards)
                  AND (SELECT count(*) FROM public.tournament_group_players gp
                        WHERE gp.jugador_ronda_id = j.id AND gp.group_id = g.id) <> 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: quedó un inscrito o una fila sin enlazar';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_grupos) gid
              JOIN public.tournament_groups g ON g.id = gid
             WHERE (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = g.ronda_libre_id)
                 < (SELECT count(*) FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
                     WHERE gp.group_id = gid AND p.status = 'approved')) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un grupo quedó con menos filas que jugadores que compiten';
  END IF;
  IF v_equipo AND EXISTS (
       SELECT 1 FROM unnest(v_cards) c
        WHERE (SELECT count(*) FROM public.ronda_equipos re WHERE re.ronda_id = c)
              <> CASE WHEN EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = c) THEN 1 ELSE 0 END
           OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = c
                       AND (SELECT count(*) FROM public.ronda_equipo_jugadores rej
                              JOIN public.ronda_equipos re ON re.id = rej.equipo_id AND re.ronda_id = c
                             WHERE rej.jugador_id = j.id) <> 1)
           OR EXISTS (SELECT 1 FROM public.ronda_equipo_jugadores rej
                        JOIN public.ronda_equipos re ON re.id = rej.equipo_id AND re.ronda_id = c
                        JOIN public.ronda_libre_jugadores j ON j.id = rej.jugador_id
                       WHERE j.ronda_id IS DISTINCT FROM c)) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un equipo quedó con miembros que no son las filas de su tarjeta';
  END IF;
  IF v_match AND v_d_card IS NOT NULL
     AND (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card) > v_jpm THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un grupo de match play quedó con más de % jugadores', v_jpm;
  END IF;
  -- Cada tarjeta tocada con filas anota en el formato que le toca: el del torneo, o stroke play si es match play y
  -- no es un par.
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl
              WHERE rl.id = ANY (v_cards)
                AND EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = rl.id)
                AND rl.formato_juego IS DISTINCT FROM
                    CASE WHEN v_match AND (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = rl.id) <> v_jpm
                         THEN 'stroke_play' ELSE v_formato END) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tocada quedó con un formato que no es el suyo';
  END IF;

  RETURN jsonb_build_object('ok', true, 'operacion', v_op, 'jugador_ronda_id', CASE WHEN v_op = 'borrar' THEN NULL ELSE v_jrid END,
                            'aprobado', v_aprobado, 'retirados_quitados', v_retirados,
                            'equipo_creado', v_eq_creado, 'equipo_borrado', v_eq_borrado);
END;
$$;

-- Privada para el cliente: solo la ruta del servidor (service role) la llama.
REVOKE ALL ON FUNCTION public.colocar_inscrito_en_grupo(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.colocar_inscrito_en_grupo(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, boolean)
  TO service_role;

-- ── 3. La falla ABIERTA de los triggers grupos_fijos_* (20261117120000), cerrada para esta RPC ─────────────────
-- La migración 20261117120000 no se edita (migraciones-inmutables): su advertencia queda actualizada acá, en el
-- catálogo, donde la lee quien abra la función.
COMMENT ON FUNCTION public.grupos_fijos_guard_jugadores_de_grupo() IS
  'Grupos fijos con el torneo iniciado (#810). Corta solo a anon/authenticated: una función SECURITY DEFINER queda exenta. '
  'La única RPC que escribe grupos en juego, colocar_inscrito_en_grupo (#814, 20261122100000), es solo de service_role y '
  'valida adentro torneo in_progress, tarjetas en curso, grupos del torneo y el enlace inscrito-fila-tarjeta. '
  'Una RPC nueva que escriba estas tablas tiene que hacer lo mismo.';

-- ── Verificación ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, 'public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'EXECUTE')
       OR has_function_privilege(r, 'public.tarjeta_tiene_anotaciones(jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar una función privada de colocar_inscrito_en_grupo', r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role no puede ejecutar colocar_inscrito_en_grupo';
  END IF;
END $$;
