-- Skins en la ronda libre (formato_juego = 'skins'). Spec: docs/specs/formato-skins.md («Datos»).
--
-- Qué agrega (todo aditivo; ninguna fila existente cambia):
--  1. 'skins' en el CHECK de formato_juego de rondas_libres. NO en historical_rounds: una ronda de skins no va al
--     historial en esta versión (un hoyo con X no tiene golpes y el ajuste WHS de esos hoyos no está resuelto). El
--     CHECK de historical_rounds sigue rechazando 'skins' a propósito: si alguna pantalla intentara guardarla, falla
--     en vez de meter una tarjeta incompleta al índice.
--  2. reglas_juego obligatoria también en skins: { config (ConfigSkins versionada, src/golf/formats/skins/config.ts),
--     jugadorIds }. Los puntos especiales van en config.puntitos con la misma forma {id, tipo, nombre?} que la Timba,
--     así marcar_puntito_ronda_libre los encuentra sin cambios.
--  3. Mismo permiso que la Timba: las guardas RESTRICTIVE pasan a cubrir 'personalizado' y 'skins' con
--     usuario_puede_crear_timba() (admin o probador). Mismos nombres de policy: se reemplazan, no se suman.
--  4. timba_ronda_para_escribir acepta 'skins': las marcas de puntos especiales y los retiros de una ronda de skins
--     usan las mismas RPC, el mismo orden por dispositivo y el mismo permiso que la Timba.
--  5. La X («Fuera del hoyo»): columna ronda_libre_jugadores.fuera_del_hoyo, objeto { "7": true }. NO es un número
--     dentro de scores: más de 20 lectores de la app suman scores sin filtrar (totales, leaderboard, historial,
--     stats) y un valor especial negativo los corrompería. Para ellos un hoyo con X es «sin golpes».
--  6. upsert_ronda_libre_scores acepta en el delta el valor "X" (string JSON) SOLO en una ronda de skins. Golpes y
--     X van en la MISMA escritura (mismo lock, misma secuencia por dispositivo): marcar X borra los golpes de ese
--     hoyo y anotar golpes borra la X, así nunca conviven. Fuera de skins, "X" es INVALID_DELTA como hasta hoy.
--     Devuelve lo mismo que antes (solo scores): ningún cliente existente cambia.
--  7. En skins, la tarjeta de un invitado sin cuenta la anota solo quien anota la ronda (hay plata en juego), igual
--     que en la Timba.
--
-- Parte de las definiciones vigentes: upsert_ronda_libre_scores (20261121120000), timba_ronda_para_escribir
-- (20261118120000), guardas (20261117020000), CHECKs (20261027180000).
-- Pruebas con roles reales: scripts/ci/pruebas-sql/skins-ronda-libre.sql.
-- Rollback: supabase/migrations/rollback/20261125_skins_ronda_libre_rollback.sql

-- 1. CHECK de formato ------------------------------------------------------------------------------------------
ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_formato_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text,
  'personalizado'::text, 'skins'::text]));

-- 2. reglas_juego ----------------------------------------------------------------------------------------------
ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_reglas_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_reglas_juego_check CHECK (
  (reglas_juego IS NULL OR jsonb_typeof(reglas_juego) = 'object')
  AND (formato_juego NOT IN ('personalizado', 'skins') OR reglas_juego IS NOT NULL)
);

COMMENT ON COLUMN public.rondas_libres.reglas_juego IS
  'Timba libre y Skins: { config (versionada: src/golf/formats/personalizado/config.ts o src/golf/formats/skins/config.ts), jugadorIds }. Obligatoria en esos formatos. Los puntos y la plata nunca se guardan: se derivan.';

-- 3. Guardas: mismo permiso que la Timba -----------------------------------------------------------------------
DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (formato_juego NOT IN ('personalizado', 'skins') OR public.usuario_puede_crear_timba());

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (formato_juego NOT IN ('personalizado', 'skins') OR public.usuario_puede_crear_timba());

-- 4. Marcas y retiros también en skins -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timba_ronda_para_escribir(p_codigo text, p_jugador_id uuid)
 RETURNS TABLE(ronda_id uuid, reglas jsonb, holes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_formato text;
  v_reglas jsonb;
  v_holes integer;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego, rl.reglas_juego, rl.holes, rlj.user_id
    INTO v_ronda_id, v_estado, v_es_demo, v_formato, v_reglas, v_holes, v_user_id
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_libre_jugadores rlj ON rlj.ronda_id = rl.id
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo
  -- Mismo lock que upsert_ronda_libre_scores: lo toma la RPC que llama (misma transacción) hasta confirmar.
  FOR SHARE OF rl;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  -- Timba o Skins (migración 20261125100000): los dos tienen puntos especiales y retiros.
  IF v_formato NOT IN ('personalizado', 'skins') OR v_reglas IS NULL THEN
    RAISE EXCEPTION 'RONDA_SIN_JUEGO' USING ERRCODE = '22023';
  END IF;
  -- Siempre con sesión (nada para anon). Al invitado sin cuenta (user_id NULL) lo marca solo quien anota la
  -- ronda (creador, marcador o un jugador de ella): antes bastaba tener el código.
  IF NOT (
    v_is_service
    -- IS NOT DISTINCT FROM y no `=`: con un invitado (user_id NULL) `=` da NULL, el IF NOT (NULL) no corta y el
    -- ajeno pasaría (lo cazó la prueba SQL).
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;

-- 5. La X, aparte de los golpes --------------------------------------------------------------------------------
ALTER TABLE public.ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS fuera_del_hoyo jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ronda_libre_jugadores DROP CONSTRAINT IF EXISTS ronda_libre_jugadores_fuera_del_hoyo_check;
ALTER TABLE public.ronda_libre_jugadores ADD CONSTRAINT ronda_libre_jugadores_fuera_del_hoyo_check
  CHECK (jsonb_typeof(fuera_del_hoyo) = 'object');

COMMENT ON COLUMN public.ronda_libre_jugadores.fuera_del_hoyo IS
  'Skins: hoyos donde el jugador levantó la pelota (la X del scorer), { "7": true }. Nunca convive con golpes en scores para el mismo hoyo: los escribe solo upsert_ronda_libre_scores.';

-- La leen los mismos que leen scores (grant por columna, como el resto de la tabla), anon incluido: la vista en
-- vivo de la ronda la necesita para mostrar el hoyo «fuera» y no como «falta anotar». No es un dato privado.
GRANT SELECT (fuera_del_hoyo) ON public.ronda_libre_jugadores TO anon, authenticated;

-- 6 y 7. Escritura de golpes y X -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(p_jugador_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_formato text;
  v_user_id uuid;
  v_scores jsonb;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
  v_x text[] := ARRAY[]::text[];
  v_golpes jsonb := p_delta;
BEGIN
  -- "X" (Fuera del hoyo, solo skins) se separa de los golpes. Las claves de la X pasan por el mismo validador que
  -- las de golpes (canónicas, 1..27). Un delta que no es objeto lo rechaza validate_score_delta como siempre.
  IF p_delta IS NOT NULL AND jsonb_typeof(p_delta) = 'object' THEN
    SELECT COALESCE(array_agg(e.key), ARRAY[]::text[]) INTO v_x
    FROM jsonb_each(p_delta) e
    WHERE e.value = '"X"'::jsonb;
    v_golpes := p_delta - v_x;
    PERFORM public.validate_score_delta((SELECT jsonb_object_agg(k, 1) FROM unnest(v_x) k));
  END IF;
  PERFORM public.validate_score_delta(v_golpes);

  -- Primero la ronda (FOR SHARE), después el jugador (FOR UPDATE), en dos sentencias: el mismo orden que el cierre
  -- y los borrados de ronda (descartar_ronda_libre, DELETE con CASCADE), para que no se crucen en un deadlock.
  -- El cierre (finalizar_ronda_libre, FOR UPDATE; o un UPDATE directo) espera a que esta escritura confirme, y una
  -- que llega después ve el estado ya cerrado. Varias escrituras a la vez no se bloquean (SHARE con SHARE).
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego
    INTO v_ronda_id, v_estado, v_es_demo, v_formato
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT rlj.user_id, rlj.scores
      INTO v_user_id, v_scores
    FROM public.ronda_libre_jugadores rlj
    WHERE rlj.id = p_jugador_id AND rlj.ronda_id = v_ronda_id
    FOR UPDATE;
    IF NOT FOUND THEN
      v_ronda_id := NULL;
    END IF;
  END IF;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  -- La X existe solo en skins: en cualquier otro formato el delta se rechaza entero, como antes.
  IF cardinality(v_x) > 0 AND v_formato IS DISTINCT FROM 'skins' THEN
    RAISE EXCEPTION 'INVALID_DELTA: "X" solo vale en una ronda de skins' USING ERRCODE = 'P0004';
  END IF;

  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
    -- Tarjeta de un invitado sin cuenta: cualquiera con el código la anota, salvo en la Timba y el Skins (hay plata
    -- en juego y los ids de los jugadores salen en /juego/publico): ahí solo quien anota la ronda (rama de arriba).
    -- Decisión de Juanjo 18-nov (Timba, 20261121120000); Skins desde 20261125100000.
    OR (v_user_id IS NULL AND v_formato IS DISTINCT FROM 'personalizado' AND v_formato IS DISTINCT FROM 'skins')
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_libre_scores_orden AS o (jugador_id, dispositivo, seq)
    VALUES (p_jugador_id, p_dispositivo, p_seq)
    ON CONFLICT (jugador_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
  END IF;

  -- Golpes y X en la misma sentencia: la X borra los golpes de su hoyo y los golpes borran la X del suyo.
  UPDATE public.ronda_libre_jugadores
  SET scores = (COALESCE(scores, '{}'::jsonb) - v_x) || COALESCE(v_golpes, '{}'::jsonb),
      fuera_del_hoyo = (fuera_del_hoyo - ARRAY(SELECT jsonb_object_keys(COALESCE(v_golpes, '{}'::jsonb))))
        || COALESCE((SELECT jsonb_object_agg(k, true) FROM unnest(v_x) k), '{}'::jsonb)
  WHERE id = p_jugador_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb, bigint, uuid) TO anon, authenticated, service_role;
