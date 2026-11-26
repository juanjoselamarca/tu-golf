-- Drives del scramble de club (registro opcional, scramble del 28-nov). Lógica del modo: src/golf/formats/drives-scramble.ts.
--
-- Qué agrega (todo aditivo; ninguna fila existente cambia y una ronda sin drives se comporta igual que hoy):
--   · ronda_equipos.drive_jugadores text[] NULL: los nombres de los jugadores del equipo con que se anotan drives.
--     NULL = el equipo no anota drives (todas las filas de hoy).
--   · ronda_equipos.drives jsonb NOT NULL DEFAULT '{}': hoyo (texto, como scores) → índice del jugador en
--     drive_jugadores (0..n-1). Se escribe SOLO con marcar_drive_equipo (el trigger de abajo cierra la tabla).
--   · rondas_libres.drives_minimo smallint NULL: drives mínimos por jugador (4 a 18 hoyos, 2 a 9). NULL = sin drives.
--   · anon lee las tres (la vista en vivo las muestra al espectador). authenticated ya lee las tablas enteras.
--   · marcar_drive_equipo(p_equipo_id, p_codigo, p_hoyo, p_jugador): marca (o, con p_jugador NULL, desmarca) quién
--     tiró el drive del equipo en un hoyo. Autorización, lock y estados COPIADOS de upsert_ronda_equipos_scores
--     (versión vigente: 20261123200000_equipo_tomado_lo_escribe_su_anotador): lock FOR UPDATE de la fila del equipo,
--     P0001 no existe · P0003 demo · P0002 no en curso · P0003 sin permiso · P0003 equipo de otro anotador.
--     Después valida el valor (P0004): el equipo anota drives, el hoyo está dentro de la ronda (1..GREATEST(holes,18),
--     el mismo rango de las marcas de la Timba: una ronda de 9 puede jugarse del 10 al 18) y el índice dentro de
--     drive_jugadores. upsert_ronda_equipos_scores NO cambia.
--   · Los drives no tocan scores, hándicap ni historial: ninguna función de cierre los lee.
--
-- Prueba con roles reales: scripts/ci/pruebas-sql/drives-scramble.sql.
-- Idempotente. Rollback: supabase/migrations/rollback/20261125_drives_scramble_de_club_rollback.sql

-- ── Columnas ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ronda_equipos
  ADD COLUMN IF NOT EXISTS drive_jugadores text[] NULL,
  ADD COLUMN IF NOT EXISTS drives jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.rondas_libres
  ADD COLUMN IF NOT EXISTS drives_minimo smallint NULL;

ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_drive_jugadores_check;
ALTER TABLE public.ronda_equipos
  ADD CONSTRAINT ronda_equipos_drive_jugadores_check
  CHECK (drive_jugadores IS NULL OR (cardinality(drive_jugadores) BETWEEN 1 AND 4 AND array_position(drive_jugadores, NULL) IS NULL));

ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_drives_check;
ALTER TABLE public.ronda_equipos
  ADD CONSTRAINT ronda_equipos_drives_check CHECK (jsonb_typeof(drives) = 'object');

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_drives_minimo_check;
ALTER TABLE public.rondas_libres
  ADD CONSTRAINT rondas_libres_drives_minimo_check CHECK (drives_minimo IS NULL OR drives_minimo BETWEEN 1 AND 18);

GRANT SELECT (drive_jugadores, drives) ON public.ronda_equipos TO anon;
GRANT SELECT (drives_minimo) ON public.rondas_libres TO anon;

-- ── marcar_drive_equipo ──────────────────────────────────────────────────────────────────────────────────────────
-- Devuelve los drives del equipo como quedaron.
CREATE OR REPLACE FUNCTION public.marcar_drive_equipo(p_equipo_id uuid, p_codigo text, p_hoyo integer, p_jugador smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_holes integer;
  v_drive_jugadores text[];
  v_anotador uuid;
  v_origen text;
  v_admin_mode boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_drives jsonb;
BEGIN
  -- Lock, existencia y estados: los de upsert_ronda_equipos_scores.
  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, rl.holes, re.drive_jugadores, re.anotador_user_id, re.handicap_origen
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_holes, v_drive_jugadores, v_anotador, v_origen
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_equipos re ON re.ronda_id = rl.id
  WHERE re.id = p_equipo_id AND rl.codigo = p_codigo
  FOR UPDATE OF re;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  -- Autorización: el mismo predicado de upsert_ronda_equipos_scores (20261123200000), copiado tal cual.
  IF NOT (
    v_is_service
    OR (auth.uid() IS NOT NULL AND (
      public.puede_anotar_ronda(v_ronda_id)
      OR (v_origen = 'club' AND v_admin_mode IS NOT TRUE AND v_anotador IS NOT DISTINCT FROM auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  IF NOT v_is_service AND v_origen = 'club' AND v_admin_mode IS NOT TRUE
     AND v_anotador IS NOT NULL AND v_anotador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo_de_otro_anotador';
  END IF;

  -- El valor (después del permiso: a quien no puede escribir no se le cuenta cómo es el equipo).
  IF v_drive_jugadores IS NULL THEN
    RAISE EXCEPTION 'INVALID_DELTA: el equipo no anota drives' USING ERRCODE = 'P0004';
  END IF;
  IF p_hoyo IS NULL OR p_hoyo < 1 OR p_hoyo > GREATEST(v_holes, 18) THEN
    RAISE EXCEPTION 'INVALID_DELTA: hoyo % fuera de la ronda', p_hoyo USING ERRCODE = 'P0004';
  END IF;
  IF p_jugador IS NOT NULL AND (p_jugador < 0 OR p_jugador >= cardinality(v_drive_jugadores)) THEN
    RAISE EXCEPTION 'INVALID_DELTA: jugador % fuera del equipo', p_jugador USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.ronda_equipos
  SET drives = CASE
    WHEN p_jugador IS NULL THEN drives - p_hoyo::text
    ELSE drives || jsonb_build_object(p_hoyo::text, p_jugador)
  END
  WHERE id = p_equipo_id
  RETURNING drives INTO v_new_drives;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_drives;
END;
$function$;

-- Igual que upsert_ronda_equipos_scores: solo authenticated (anon no anota equipos).
REVOKE ALL ON FUNCTION public.marcar_drive_equipo(uuid, text, integer, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_drive_equipo(uuid, text, integer, smallint) TO authenticated;

-- ── Por la tabla no: los drives se marcan solo con marcar_drive_equipo ───────────────────────────────────────────
-- La policy manage_ronda_equipos deja al creador escribir la fila entera; sin esto podría cambiar los drives de un
-- equipo que anota otro celular, o saltarse las validaciones de la RPC. SIN SECURITY DEFINER: current_user tiene
-- que ser el de quien escribe (como ronda_equipos_scores_de_su_anotador). La RPC corre como su dueño y pasa.
CREATE OR REPLACE FUNCTION public.ronda_equipos_drives_solo_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NEW.drives IS DISTINCT FROM OLD.drives THEN
    RAISE EXCEPTION 'DRIVES_SOLO_POR_RPC' USING ERRCODE = '42501',
      DETAIL = 'los drives se marcan con marcar_drive_equipo';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ronda_equipos_drives_solo_por_rpc() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ronda_equipos_drives_solo_por_rpc ON public.ronda_equipos;
CREATE TRIGGER ronda_equipos_drives_solo_por_rpc
  BEFORE UPDATE OF drives ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_drives_solo_por_rpc();
