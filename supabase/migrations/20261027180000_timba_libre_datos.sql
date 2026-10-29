-- Timba libre (formato `personalizado`), PR B: datos, guardas y escritura de puntos especiales y retiros.
-- Spec: docs/specs/formato-personalizado.md ("Contrato para la integración (PR B)").
--
-- Qué agrega (todo aditivo; ninguna fila existente cambia):
--  1. 'personalizado' en el CHECK de formato_juego de rondas_libres y historical_rounds (verificado en prod el
--     27-oct con una consulta de solo lectura: el CHECK vivo era el del baseline).
--  2. rondas_libres.reglas_juego: { config, jugadorIds } (config versionada del motor + orden de los jugadores,
--     cláusula 2). Es obligatoria en una ronda personalizada y solo puede ser un objeto JSON.
--  3. Guarda RESTRICTIVE: solo un admin crea (o pasa a) una ronda personalizada. La API ya responde 403 a un no
--     admin; esto cierra el PATCH directo a PostgREST. Restrictiva porque es una guarda: una PERMISSIVE se sumaría
--     con OR a "crear_ronda"/"actualizar_ronda" y abriría en vez de cerrar. usuario_es_admin() es SECURITY
--     DEFINER: authenticated no siempre puede leer profiles.role, y una policy que no puede leer falla para TODAS
--     las rondas.
--  4. ronda_libre_puntitos: marcas manuales del scorer (sandy, chipingo, greenie, propio). Una por
--     (ronda, jugador, hoyo, puntito) (cláusula 4). El orden de "vale el último" es (created_at, id) (cláusula 3).
--  5. ronda_libre_retiros: desde qué hoyo se retiró un jugador (cláusula 9).
--  6. ronda_libre_juego_orden: secuencia por dispositivo (privada, como ronda_libre_scores_orden): una marca vieja
--     que llega tarde no pisa una más nueva del mismo dispositivo sobre la misma clave.
--  7. RPC marcar_puntito_ronda_libre y marcar_retiro_ronda_libre. El greenie es uno por hoyo EN LA ESCRITURA
--     (cláusula 5): asignarlo borra en la misma operación los otros greenies del hoyo; quitarlo los borra todos.
--
-- Privacidad: las tablas nuevas nacen sin permisos para PUBLIC, anon y authenticated, sin policies (RLS activa =
-- nadie salvo service_role). Las lee solo el servidor con la clave de servicio (src/lib/data/ronda-libre-timba.ts).
-- Las RPC se otorgan a authenticated (nada para anon). Mismo criterio de quién anota que upsert_ronda_libre_scores.
--
-- El par del hoyo NO se valida acá (greenie solo en par 3): el motor lo evalúa al calcular y lo muestra como
-- "no cuenta" con la razón, sin borrar datos (spec, "Puntos especiales").
--
-- Rollback: supabase/migrations/rollback/20261027_timba_libre_datos_rollback.sql

-- 1. CHECK de formato ------------------------------------------------------------------------------------------
ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_formato_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text,
  'personalizado'::text]));

ALTER TABLE public.historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_formato_check;
ALTER TABLE public.historical_rounds ADD CONSTRAINT historical_rounds_formato_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text,
  'personalizado'::text]));

-- 2. reglas_juego ----------------------------------------------------------------------------------------------
ALTER TABLE public.rondas_libres ADD COLUMN IF NOT EXISTS reglas_juego jsonb NULL;

COMMENT ON COLUMN public.rondas_libres.reglas_juego IS
  'Timba libre: { config (versionada, src/golf/formats/personalizado/config.ts), jugadorIds (orden A, B, C, D) }. Solo en formato personalizado. Los puntos nunca se guardan: se derivan.';

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_reglas_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_reglas_juego_check CHECK (
  (reglas_juego IS NULL OR jsonb_typeof(reglas_juego) = 'object')
  AND (formato_juego <> 'personalizado' OR reglas_juego IS NOT NULL)
);

-- 3. Guarda: personalizado solo para admins --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');
$function$;

REVOKE ALL ON FUNCTION public.usuario_es_admin() FROM PUBLIC, anon, authenticated;
-- anon también: las guardas de abajo son TO public y Postgres chequea el EXECUTE al planificar, aunque el OR
-- no llegue a llamarla. Sin el grant, cualquier INSERT/UPDATE anónimo sobre rondas_libres (de cualquier formato)
-- fallaría con 42501 en vez de pasar por sus policies. Para anon devuelve false sin leer nada: auth.uid() es
-- null y el AND corta antes de mirar profiles; y solo devuelve un booleano sobre el propio usuario.
GRANT EXECUTE ON FUNCTION public.usuario_es_admin() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_es_admin());

-- En UPDATE la guarda exige admin para dejar una fila en personalizado, también si el UPDATE no toca ni el formato
-- ni las reglas. Hoy es correcto porque nadie más que el creador (que era admin al crearla) puede hacer UPDATE de
-- rondas_libres con su rol: la única policy permisiva de UPDATE es "actualizar_ronda" (auth.uid() = creador_id), y
-- cerrar la ronda va por finalizar_ronda_libre (SECURITY DEFINER, dueño postgres con BYPASSRLS). Si un día se abre
-- el UPDATE a otros (marcador, jugadores), esta guarda tiene que pasar a mirar OLD (trigger): si no, les bloquearía
-- cualquier UPDATE de una Timba. Lo cubre scripts/ci/pruebas-sql/timba-libre.sql.
DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
CREATE POLICY "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (formato_juego <> 'personalizado' OR public.usuario_es_admin());

-- 4. Marcas de puntos especiales -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ronda_libre_puntitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id uuid NOT NULL REFERENCES public.rondas_libres(id) ON DELETE CASCADE,
  jugador_id uuid NOT NULL REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE,
  hoyo integer NOT NULL CHECK (hoyo BETWEEN 1 AND 27),
  puntito_id text NOT NULL CHECK (char_length(puntito_id) BETWEEN 1 AND 40),
  -- clock_timestamp y no now(): dos marcas en la misma transacción no empatan.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ronda_libre_puntitos_unica UNIQUE (ronda_id, jugador_id, hoyo, puntito_id)
);

CREATE INDEX IF NOT EXISTS idx_ronda_libre_puntitos_orden ON public.ronda_libre_puntitos (ronda_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_ronda_libre_puntitos_jugador ON public.ronda_libre_puntitos (jugador_id);

ALTER TABLE public.ronda_libre_puntitos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ronda_libre_puntitos FROM PUBLIC, anon, authenticated;

-- 5. Retiros ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ronda_libre_retiros (
  jugador_id uuid PRIMARY KEY REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE,
  ronda_id uuid NOT NULL REFERENCES public.rondas_libres(id) ON DELETE CASCADE,
  desde_hoyo integer NOT NULL CHECK (desde_hoyo BETWEEN 1 AND 27),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ronda_libre_retiros_ronda ON public.ronda_libre_retiros (ronda_id);

ALTER TABLE public.ronda_libre_retiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ronda_libre_retiros FROM PUBLIC, anon, authenticated;

-- 6. Secuencia por dispositivo ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ronda_libre_juego_orden (
  ronda_id uuid NOT NULL REFERENCES public.rondas_libres(id) ON DELETE CASCADE,
  clave text NOT NULL,
  dispositivo uuid NOT NULL,
  seq bigint NOT NULL,
  PRIMARY KEY (ronda_id, clave, dispositivo)
);

ALTER TABLE public.ronda_libre_juego_orden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ronda_libre_juego_orden FROM PUBLIC, anon, authenticated;

-- 7. RPC -------------------------------------------------------------------------------------------------------

-- Ronda + jugador + permiso, compartido por las dos RPC. Devuelve el id de la ronda y sus reglas.
CREATE OR REPLACE FUNCTION public.timba_ronda_para_escribir(p_codigo text, p_jugador_id uuid)
 RETURNS TABLE (ronda_id uuid, reglas jsonb, holes integer)
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
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_formato <> 'personalizado' OR v_reglas IS NULL THEN
    RAISE EXCEPTION 'RONDA_SIN_JUEGO' USING ERRCODE = '22023';
  END IF;
  -- Mismo criterio que upsert_ronda_libre_scores, pero siempre con sesión (nada para anon).
  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id = v_uid OR v_user_id IS NULL OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;

REVOKE ALL ON FUNCTION public.timba_ronda_para_escribir(text, uuid) FROM PUBLIC, anon, authenticated;

-- true = la operación se aplicó (o no hacía falta); false = el dispositivo ya aplicó una más nueva en esa clave.
CREATE OR REPLACE FUNCTION public.timba_registrar_secuencia(p_ronda_id uuid, p_clave text, p_seq bigint, p_dispositivo uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_seq IS NULL OR p_dispositivo IS NULL THEN
    RETURN true;
  END IF;
  INSERT INTO public.ronda_libre_juego_orden AS o (ronda_id, clave, dispositivo, seq)
  VALUES (p_ronda_id, p_clave, p_dispositivo, p_seq)
  ON CONFLICT (ronda_id, clave, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.timba_registrar_secuencia(uuid, text, bigint, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.marcar_puntito_ronda_libre(
  p_codigo text,
  p_jugador_id uuid,
  p_hoyo integer,
  p_puntito_id text,
  p_marcar boolean,
  p_seq bigint DEFAULT NULL,
  p_dispositivo uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_reglas jsonb;
  v_holes integer;
  v_tipo text;
BEGIN
  IF p_hoyo IS NULL OR p_puntito_id IS NULL OR p_marcar IS NULL THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT t.ronda_id, t.reglas, t.holes INTO v_ronda_id, v_reglas, v_holes
  FROM public.timba_ronda_para_escribir(p_codigo, p_jugador_id) t;

  -- Hoyo de la ronda: una ronda de 9 que sale del 10 juega 10..18.
  IF p_hoyo < 1 OR p_hoyo > GREATEST(v_holes, 18) THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023', DETAIL = 'hoyo fuera de la ronda';
  END IF;

  -- El tipo sale de las reglas guardadas, nunca del cliente. El birdie no se marca: sale de los golpes.
  SELECT p->>'tipo' INTO v_tipo
  FROM jsonb_array_elements(COALESCE(v_reglas->'config'->'puntitos', '[]'::jsonb)) p
  WHERE p->>'id' = p_puntito_id
  LIMIT 1;
  IF v_tipo IS NULL OR v_tipo = 'birdie' THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023', DETAIL = 'punto especial inexistente o automático';
  END IF;

  -- Serializa las marcas del mismo punto en el mismo hoyo: dos teléfonos asignando el greenie a la vez
  -- borrarían "nada" los dos e insertarían dos greenies.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ronda_id::text || ':' || p_hoyo || ':' || p_puntito_id, 0));

  -- Greenie: uno por hoyo, así que la clave es del hoyo y no del jugador.
  IF NOT public.timba_registrar_secuencia(
    v_ronda_id,
    CASE WHEN v_tipo = 'greenie' THEN 'p:' || p_hoyo || ':' || p_puntito_id
         ELSE 'p:' || p_hoyo || ':' || p_puntito_id || ':' || p_jugador_id END,
    p_seq, p_dispositivo
  ) THEN
    RETURN jsonb_build_object('aplicada', false);
  END IF;

  IF v_tipo = 'greenie' THEN
    -- Asignar reemplaza y quitar borra todos: la marca anterior nunca revive.
    DELETE FROM public.ronda_libre_puntitos
    WHERE ronda_id = v_ronda_id AND hoyo = p_hoyo AND puntito_id = p_puntito_id;
    IF p_marcar THEN
      INSERT INTO public.ronda_libre_puntitos (ronda_id, jugador_id, hoyo, puntito_id)
      VALUES (v_ronda_id, p_jugador_id, p_hoyo, p_puntito_id);
    END IF;
  ELSIF p_marcar THEN
    INSERT INTO public.ronda_libre_puntitos (ronda_id, jugador_id, hoyo, puntito_id)
    VALUES (v_ronda_id, p_jugador_id, p_hoyo, p_puntito_id)
    ON CONFLICT (ronda_id, jugador_id, hoyo, puntito_id) DO NOTHING;
  ELSE
    DELETE FROM public.ronda_libre_puntitos
    WHERE ronda_id = v_ronda_id AND jugador_id = p_jugador_id AND hoyo = p_hoyo AND puntito_id = p_puntito_id;
  END IF;

  RETURN jsonb_build_object('aplicada', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.marcar_puntito_ronda_libre(text, uuid, integer, text, boolean, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_puntito_ronda_libre(text, uuid, integer, text, boolean, bigint, uuid) TO authenticated, service_role;

-- p_desde_hoyo NULL = deshacer el retiro.
CREATE OR REPLACE FUNCTION public.marcar_retiro_ronda_libre(
  p_codigo text,
  p_jugador_id uuid,
  p_desde_hoyo integer,
  p_seq bigint DEFAULT NULL,
  p_dispositivo uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_reglas jsonb;
  v_holes integer;
BEGIN
  SELECT t.ronda_id, t.reglas, t.holes INTO v_ronda_id, v_reglas, v_holes
  FROM public.timba_ronda_para_escribir(p_codigo, p_jugador_id) t;

  IF p_desde_hoyo IS NOT NULL AND (p_desde_hoyo < 1 OR p_desde_hoyo > GREATEST(v_holes, 18)) THEN
    RAISE EXCEPTION 'RETIRO_INVALIDO' USING ERRCODE = '22023', DETAIL = 'hoyo fuera de la ronda';
  END IF;

  IF NOT public.timba_registrar_secuencia(v_ronda_id, 'r:' || p_jugador_id, p_seq, p_dispositivo) THEN
    RETURN jsonb_build_object('aplicada', false);
  END IF;

  IF p_desde_hoyo IS NULL THEN
    DELETE FROM public.ronda_libre_retiros WHERE jugador_id = p_jugador_id;
  ELSE
    INSERT INTO public.ronda_libre_retiros (jugador_id, ronda_id, desde_hoyo)
    VALUES (p_jugador_id, v_ronda_id, p_desde_hoyo)
    ON CONFLICT (jugador_id) DO UPDATE SET desde_hoyo = EXCLUDED.desde_hoyo, created_at = clock_timestamp();
  END IF;

  RETURN jsonb_build_object('aplicada', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.marcar_retiro_ronda_libre(text, uuid, integer, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_retiro_ronda_libre(text, uuid, integer, bigint, uuid) TO authenticated, service_role;
