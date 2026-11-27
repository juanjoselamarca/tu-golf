-- «Terminar mi equipo»: en una ronda de un celular por equipo (equipos de club, admin_mode no TRUE) cada equipo cierra
-- su tarjeta, y la ronda se cierra sola cuando termina el último. Pedido de Juanjo (27-nov) para el scramble del 28-nov.
-- Plan: revisor Fable 27-nov (cierre por equipo, PR-A).
--
-- Qué agrega (todo aditivo; ninguna fila existente cambia y una ronda que no lo usa se comporta igual que hoy):
--   · ronda_equipos.terminado_at timestamptz NULL: cuándo el equipo terminó su tarjeta. NULL = sigue jugando (todas
--     las filas de hoy). Sin GRANT a anon (la vista en vivo lo lee con sesión; anon no lo necesita).
--   · terminar_equipo_de_ronda(p_codigo, p_equipo_id): valida que la tarjeta del equipo esté completa, lo marca y, si
--     era el último equipo sin terminar, pone la ronda en 'finalizada' en la MISMA transacción. Bloquea la fila de la
--     ronda FOR UPDATE: dos celulares que terminan a la vez se ordenan y exactamente uno cierra.
--   · reabrir_equipo_de_ronda(p_codigo, p_equipo_id): con la ronda en curso, vuelve el equipo a «jugando» (corregir un
--     hoyo mientras el otro equipo sigue en la cancha).
--   · Trigger ronda_equipos_terminado_guard: los scores de un equipo terminado no cambian por ningún camino
--     (upsert_ronda_equipos_scores incluido, que por eso NO se reescribe). Un delta repetido (reintento de la cola)
--     deja los scores iguales y pasa; uno distinto da P0003 / DETAIL 'equipo_terminado'. Además el cliente no cambia
--     terminado_at por la tabla (solo las dos RPC).
--
-- No cambia: finalizar_ronda_libre, liberar_equipo_de_ronda, reclamar_equipo_de_ronda, marcar_drive_equipo,
-- upsert_ronda_equipos_scores. Un celular con el código anterior sigue cerrando la ronda como hoy.
-- Seguimiento (revisión Fable 27-nov, P2): que finalizar_ronda_libre use ronda_libre_tarjeta_completa (hoy la regla
-- está también inline allá), y decidir si reclamar_equipo_de_ronda rechaza un equipo terminado sin anotador (hoy
-- cualquiera con el código puede reclamar un equipo libre, terminado o no: mismo modelo de confianza de siempre).
-- También: reabrir no repite el chequeo «ronda de torneo» de terminar (inocuo: un equipo de torneo nace 'calculado' y
-- nunca queda terminado); unificar ambos predicados cuando se toque finalizar_ronda_libre.
--
-- Permiso de terminar/reabrir (mismo modelo que upsert_ronda_equipos_scores en un equipo de club):
--   · el anotador del equipo; o
--   · el creador, si el equipo no tiene anotador (lo anota él: «Anotarlo yo» o equipo liberado).
--   El creador NO termina un equipo que anota otro celular: primero lo libera.
-- Completitud: la regla de finalizar_ronda_libre (claves numéricas ≥ 1, al menos `holes`), en
-- ronda_libre_tarjeta_completa.
--
-- Prueba con roles reales: scripts/ci/pruebas-sql/terminar-equipo.sql.
-- Idempotente. Rollback: supabase/migrations/rollback/20261127_terminar_equipo_de_ronda_rollback.sql

-- ── Columna ──────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ronda_equipos
  ADD COLUMN IF NOT EXISTS terminado_at timestamptz NULL;

-- ── Completitud de una tarjeta (espejo de `tarjetaCompleta`, src/lib/ronda/helpers.ts) ─────────────────────────
-- Misma regla que finalizar_ronda_libre: claves numéricas ≥ 1, al menos p_holes (una ronda de 9 desde el 10 usa 10..18).
CREATE OR REPLACE FUNCTION public.ronda_libre_tarjeta_completa(p_scores jsonb, p_holes integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (
    SELECT count(*) FROM jsonb_object_keys(
      CASE WHEN jsonb_typeof(p_scores) = 'object' THEN p_scores ELSE '{}'::jsonb END
    ) k
    WHERE k ~ '^[0-9]+$' AND k::int >= 1
  ) >= COALESCE(p_holes, 18);
$$;

REVOKE ALL ON FUNCTION public.ronda_libre_tarjeta_completa(jsonb, integer) FROM PUBLIC, anon, authenticated;

-- ── terminar_equipo_de_ronda ─────────────────────────────────────────────────────────────────────────────────────
-- Devuelve {estado:'ok', ronda_cerrada:bool} o {estado:'incompleto'}. Con la ronda ya cerrada devuelve ok con
-- ronda_cerrada TRUE (es el reintento de un «terminar» que cerró y cuya respuesta se perdió) y no la toca.
CREATE OR REPLACE FUNCTION public.terminar_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_admin_mode boolean;
  v_creador uuid;
  v_holes integer;
  v_equipo_id uuid;
  v_origen text;
  v_anotador uuid;
  v_scores jsonb;
  v_pendientes integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  -- La ronda FOR UPDATE (no FOR SHARE): dos «terminar» a la vez se ordenan aquí y el segundo ve la marca del primero.
  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, rl.creador_id, COALESCE(rl.holes, 18)
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_creador, v_holes
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR UPDATE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.handicap_origen, re.anotador_user_id, re.scores
      INTO v_equipo_id, v_origen, v_anotador, v_scores
    FROM public.ronda_equipos re
    WHERE re.id = p_equipo_id AND re.ronda_id = v_ronda_id
    FOR UPDATE;
  END IF;

  IF v_ronda_id IS NULL OR v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  -- Mismos predicados de modo que reclamar_equipo_de_ronda: solo equipos de club de una ronda de un celular por equipo.
  IF v_admin_mode IS TRUE THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de un celular';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups tg WHERE tg.ronda_libre_id = v_ronda_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;
  IF v_origen IS DISTINCT FROM 'club' THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo no es de club';
  END IF;
  -- IS NOT DISTINCT FROM: con anotador NULL, `=` daría NULL y el IF no cortaría.
  IF NOT (
    v_anotador IS NOT DISTINCT FROM v_uid
    OR (v_anotador IS NULL AND v_creador IS NOT DISTINCT FROM v_uid)
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo_de_otro_anotador';
  END IF;

  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RETURN jsonb_build_object('estado', 'ok', 'ronda_cerrada', true);
  END IF;

  IF NOT public.ronda_libre_tarjeta_completa(v_scores, v_holes) THEN
    RETURN jsonb_build_object('estado', 'incompleto');
  END IF;

  UPDATE public.ronda_equipos
  SET terminado_at = COALESCE(terminado_at, now())
  WHERE id = v_equipo_id;

  SELECT count(*) INTO v_pendientes
  FROM public.ronda_equipos re
  WHERE re.ronda_id = v_ronda_id AND re.terminado_at IS NULL;

  IF v_pendientes = 0 THEN
    UPDATE public.rondas_libres SET estado = 'finalizada' WHERE id = v_ronda_id AND estado = 'en_curso';
    RETURN jsonb_build_object('estado', 'ok', 'ronda_cerrada', true);
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'ronda_cerrada', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.terminar_equipo_de_ronda(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminar_equipo_de_ronda(text, uuid) TO authenticated;

-- ── reabrir_equipo_de_ronda ──────────────────────────────────────────────────────────────────────────────────────
-- Con la ronda en curso, el equipo vuelve a «jugando» y su anotador puede corregir. Ronda cerrada: P0002.
CREATE OR REPLACE FUNCTION public.reabrir_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_admin_mode boolean;
  v_creador uuid;
  v_equipo_id uuid;
  v_origen text;
  v_anotador uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  -- FOR UPDATE como terminar: un reabrir y el «terminar» del último equipo no se cruzan.
  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, rl.creador_id
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_creador
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR UPDATE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.handicap_origen, re.anotador_user_id
      INTO v_equipo_id, v_origen, v_anotador
    FROM public.ronda_equipos re
    WHERE re.id = p_equipo_id AND re.ronda_id = v_ronda_id
    FOR UPDATE;
  END IF;

  IF v_ronda_id IS NULL OR v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_admin_mode IS TRUE THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de un celular';
  END IF;
  IF v_origen IS DISTINCT FROM 'club' THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo no es de club';
  END IF;
  IF NOT (
    v_anotador IS NOT DISTINCT FROM v_uid
    OR (v_anotador IS NULL AND v_creador IS NOT DISTINCT FROM v_uid)
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo_de_otro_anotador';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ronda_equipos SET terminado_at = NULL WHERE id = v_equipo_id AND terminado_at IS NOT NULL;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.reabrir_equipo_de_ronda(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_equipo_de_ronda(text, uuid) TO authenticated;

-- ── Trigger: un equipo terminado no cambia sus scores; terminado_at solo por las RPC ─────────────────────────────
-- SIN SECURITY DEFINER: current_user tiene que ser el de quien escribe (como ronda_equipos_drives_solo_por_rpc).
-- La regla de scores vale para TODOS los roles (también dentro de upsert_ronda_equipos_scores, que corre como su
-- dueño): un delta que no cambia nada (reintento) pasa porque NEW.scores = OLD.scores. Corregir = reabrir primero.
CREATE OR REPLACE FUNCTION public.ronda_equipos_terminado_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Un equipo nace jugando: la policy manage_ronda_equipos deja insertar al creador, pero no ya terminado.
    IF current_user IN ('anon', 'authenticated') AND NEW.terminado_at IS NOT NULL THEN
      RAISE EXCEPTION 'TERMINADO_SOLO_POR_RPC' USING ERRCODE = '42501',
        DETAIL = 'un equipo se termina con terminar_equipo_de_ronda';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user IN ('anon', 'authenticated') AND NEW.terminado_at IS DISTINCT FROM OLD.terminado_at THEN
    RAISE EXCEPTION 'TERMINADO_SOLO_POR_RPC' USING ERRCODE = '42501',
      DETAIL = 'un equipo se termina con terminar_equipo_de_ronda y se reabre con reabrir_equipo_de_ronda';
  END IF;
  IF OLD.terminado_at IS NOT NULL AND NEW.terminado_at IS NOT NULL AND NEW.scores IS DISTINCT FROM OLD.scores THEN
    RAISE EXCEPTION 'EQUIPO_TERMINADO' USING ERRCODE = 'P0003', DETAIL = 'equipo_terminado';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ronda_equipos_terminado_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ronda_equipos_terminado_guard ON public.ronda_equipos;
CREATE TRIGGER ronda_equipos_terminado_guard
  BEFORE INSERT OR UPDATE OF terminado_at, scores ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_terminado_guard();
