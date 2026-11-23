-- Scramble rápido (PR1, solo SQL): equipos con el hándicap que da el club y un celular por equipo.
-- Plan: docs/superpowers/plans/2026-11-23-scramble-rapido.md (§1 y §2).
--
-- Qué agrega en ronda_equipos:
--   · handicap_origen: 'calculado' (hoy, desde los jugadores) o 'club' (el creador escribe el número del club). Así se
--     distingue un equipo de club sin inferirlo de "equipo con menos de 2 miembros".
--   · anotador_user_id: la cuenta que anota ESE equipo desde su celular (ON DELETE SET NULL: eliminar la cuenta lo
--     libera, no bloquea).
--   · anotador_nombre: su nombre para mostrar «lo anota Pedro». authenticated no lee profiles ajenos, por eso se copia.
--     Lo escribe SOLO el trigger ronda_equipos_anotador_nombre desde profiles.name (nadie lo falsifica desde el
--     cliente) y se borra cuando anotador_user_id queda NULL: al liberar el equipo y al eliminar la cuenta (la acción
--     SET NULL de la FK dispara el trigger), igual que eliminar_cuenta anonimiza los nombres.
--   · Índice único parcial (ronda_id, anotador_user_id): un usuario anota a lo más un equipo por ronda, también con dos
--     reclamos simultáneos desde dos pestañas (cada uno bloquea solo su fila de equipo).
--
-- upsert_ronda_equipos_scores: misma firma; el cuerpo parte del vigente (20261020200000_orden_guardados_ronda_equipos,
-- igual al de prod el 23-nov) y solo cambia la autorización: además de puede_anotar_ronda, escribe el anotador de ESE
-- equipo. anotador_user_id se lee bajo el FOR UPDATE de la fila de equipo, el mismo lock que toma liberar: una
-- escritura que llega después de liberar ve el NULL y recibe P0003.
-- puede_anotar_ronda NO cambia: la usan el cierre, la Timba y otros, y el anotador de un equipo no gana poder sobre
-- la ronda entera (no cierra, no escribe otros equipos).
--
-- reclamar_equipo_de_ronda / liberar_equipo_de_ronda: SECURITY DEFINER, solo authenticated. Orden de locks: la ronda
-- FOR SHARE y después el equipo FOR UPDATE, el mismo de upsert_ronda_libre_scores y del cierre/borrado de rondas.
--
-- anon: solo handicap_origen (la vista en vivo puede marcar "(club)"). anotador_user_id y anotador_nombre no: quién
-- anota es dato del scorer, no del espectador. authenticated ya lee la tabla entera (grant de tabla).
--
-- Prueba: scripts/ci/pruebas-sql/equipos-de-club.sql.
-- Idempotente. Rollback: supabase/migrations/rollback/20261123_scramble_equipos_de_club_rollback.sql

-- ── Columnas ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ronda_equipos
  ADD COLUMN IF NOT EXISTS handicap_origen text NOT NULL DEFAULT 'calculado',
  ADD COLUMN IF NOT EXISTS anotador_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS anotador_nombre text NULL;

ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_handicap_origen_check;
ALTER TABLE public.ronda_equipos
  ADD CONSTRAINT ronda_equipos_handicap_origen_check CHECK (handicap_origen IN ('calculado', 'club'));

ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_anotador_user_id_fkey;
ALTER TABLE public.ronda_equipos
  ADD CONSTRAINT ronda_equipos_anotador_user_id_fkey
  FOREIGN KEY (anotador_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Sin anotador no hay nombre de anotador (el trigger lo garantiza; el CHECK lo deja escrito).
ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_anotador_nombre_check;
ALTER TABLE public.ronda_equipos
  ADD CONSTRAINT ronda_equipos_anotador_nombre_check CHECK (anotador_user_id IS NOT NULL OR anotador_nombre IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ronda_equipos_un_equipo_por_anotador
  ON public.ronda_equipos (ronda_id, anotador_user_id) WHERE anotador_user_id IS NOT NULL;

GRANT SELECT (handicap_origen) ON public.ronda_equipos TO anon;

-- ── anotador_nombre sigue a anotador_user_id ─────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER: lee profiles.name de otra cuenta (authenticated no puede).
CREATE OR REPLACE FUNCTION public.ronda_equipos_anotador_nombre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.anotador_user_id IS NULL THEN
    NEW.anotador_nombre := NULL;
  ELSE
    NEW.anotador_nombre := (SELECT p.name FROM public.profiles p WHERE p.id = NEW.anotador_user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Las funciones de trigger no se llaman directo: sin EXECUTE para nadie del cliente.
REVOKE ALL ON FUNCTION public.ronda_equipos_anotador_nombre() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ronda_equipos_anotador_nombre ON public.ronda_equipos;
CREATE TRIGGER ronda_equipos_anotador_nombre
  BEFORE INSERT OR UPDATE OF anotador_user_id, anotador_nombre ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_anotador_nombre();

-- ── Nadie pone de anotador a otra cuenta desde el cliente ────────────────────────────────────────────────────────
-- La policy manage_ronda_equipos deja al creador escribir la fila entera. Sin esta guarda podría nombrar anotador a
-- cualquier cuenta (también en una ronda con admin_mode o de torneo) y, vía el trigger del nombre, leer el
-- profiles.name de un uuid ajeno. Desde el cliente (anon/authenticated) solo vale ponerse a sí mismo (el insert del
-- equipo 1 con el creador) o dejarlo NULL; las RPC corren como su dueño y pasan. SIN SECURITY DEFINER: current_user
-- tiene que ser el de quien escribe. Se dispara antes que ronda_equipos_anotador_nombre (orden alfabético).
CREATE OR REPLACE FUNCTION public.ronda_equipos_anotador_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NEW.anotador_user_id IS NOT NULL
     AND NEW.anotador_user_id IS DISTINCT FROM auth.uid()
     AND (TG_OP = 'INSERT' OR NEW.anotador_user_id IS DISTINCT FROM OLD.anotador_user_id) THEN
    RAISE EXCEPTION 'ANOTADOR_AJENO' USING ERRCODE = '42501',
      DETAIL = 'un equipo se reclama con reclamar_equipo_de_ronda; desde el cliente solo puedes ponerte a ti';
  END IF;
  RETURN NEW;
END;
$;

REVOKE ALL ON FUNCTION public.ronda_equipos_anotador_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ronda_equipos_anotador_guard ON public.ronda_equipos;
CREATE TRIGGER ronda_equipos_anotador_guard
  BEFORE INSERT OR UPDATE OF anotador_user_id ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_anotador_guard();

-- ── upsert_ronda_equipos_scores: también escribe el anotador de ese equipo ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(p_equipo_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_scores jsonb;
  v_anotador uuid;
  v_origen text;
  v_admin_mode boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, re.scores, re.anotador_user_id, re.handicap_origen
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_scores, v_anotador, v_origen
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

  -- El anotador de un equipo (un celular por equipo) escribe SOLO ese equipo: v_anotador es el de esta fila, leído
  -- bajo su lock. puede_anotar_ronda (creador, marcador, jugadores) sigue escribiendo cualquiera, como antes.
  -- IS NOT DISTINCT FROM y no `=`: con el equipo sin anotador, `NULL = uid` es NULL y NOT (false OR NULL) también,
  -- y el IF no cortaría. La rama del anotador vale solo en un equipo de club de una ronda de un celular por equipo
  -- (admin_mode no TRUE), las mismas condiciones con que reclamar_equipo_de_ronda lo asigna.
  IF NOT (
    v_is_service
    OR (auth.uid() IS NOT NULL AND (
      public.puede_anotar_ronda(v_ronda_id)
      OR (v_origen = 'club' AND v_admin_mode IS NOT TRUE AND v_anotador IS NOT DISTINCT FROM auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_equipos_scores_orden AS o (equipo_id, dispositivo, seq)
    VALUES (p_equipo_id, p_dispositivo, p_seq)
    ON CONFLICT (equipo_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
  END IF;

  UPDATE public.ronda_equipos
  SET scores = COALESCE(scores, '{}'::jsonb) || p_delta
  WHERE id = p_equipo_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$function$;

-- CREATE OR REPLACE conserva los grants; se repiten para que la migración deje explícito quién la ejecuta.
REVOKE ALL ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb, bigint, uuid) TO authenticated;

-- ── reclamar_equipo_de_ronda ─────────────────────────────────────────────────────────────────────────────────────
-- El celular de un equipo toma ese equipo para anotarlo. Solo en rondas de "un celular por equipo": en curso, no demo,
-- sin admin_mode (toda ronda de equipos existente tiene admin_mode = true: ninguna queda reclamable), sin torneo, y
-- equipo de club. Respuestas:
--   {estado:'ok'}                                  lo tomó (o ya era suyo: idempotente)
--   {estado:'tomado', anotador_nombre}             lo anota otra cuenta
--   {estado:'ya_tienes_equipo', equipo_id}         ya anota otro equipo de esta ronda (uno por cuenta)
-- Errores: P0001 no existe · P0002 ronda no en curso · P0003 sin sesión, demo, admin_mode, torneo o equipo no de club.
CREATE OR REPLACE FUNCTION public.reclamar_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
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
  v_equipo_id uuid;
  v_origen text;
  v_anotador uuid;
  v_anotador_nombre text;
  v_otro uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  -- Primero la ronda (FOR SHARE), después el equipo (FOR UPDATE), en dos sentencias.
  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.handicap_origen, re.anotador_user_id, re.anotador_nombre
      INTO v_equipo_id, v_origen, v_anotador, v_anotador_nombre
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
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_admin_mode IS TRUE THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de un celular';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups tg WHERE tg.ronda_libre_id = v_ronda_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;
  IF v_origen IS DISTINCT FROM 'club' THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo no es de club';
  END IF;

  IF v_anotador IS NOT DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('estado', 'ok');
  END IF;
  IF v_anotador IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'tomado', 'anotador_nombre', v_anotador_nombre);
  END IF;

  SELECT re.id INTO v_otro
  FROM public.ronda_equipos re
  WHERE re.ronda_id = v_ronda_id AND re.anotador_user_id = v_uid
  LIMIT 1;
  IF v_otro IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'ya_tienes_equipo', 'equipo_id', v_otro);
  END IF;

  BEGIN
    -- anotador_nombre lo pone el trigger desde profiles.name.
    UPDATE public.ronda_equipos SET anotador_user_id = v_uid WHERE id = v_equipo_id;
  EXCEPTION WHEN unique_violation THEN
    -- Otro reclamo de la misma cuenta, sobre otro equipo, confirmó entre la lectura de arriba y este UPDATE.
    SELECT re.id INTO v_otro
    FROM public.ronda_equipos re
    WHERE re.ronda_id = v_ronda_id AND re.anotador_user_id = v_uid
    LIMIT 1;
    RETURN jsonb_build_object('estado', 'ya_tienes_equipo', 'equipo_id', v_otro);
  END;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.reclamar_equipo_de_ronda(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclamar_equipo_de_ronda(text, uuid) TO authenticated;

-- ── liberar_equipo_de_ronda ──────────────────────────────────────────────────────────────────────────────────────
-- El creador de la ronda o el anotador de ese equipo lo deja sin anotador (el creador vuelve a anotarlo desde su
-- celular). Respuesta: {estado:'ok'} (idempotente si ya estaba libre y lo pide el creador).
-- Errores: P0001 no existe · P0002 ronda no en curso · P0003 sin sesión, demo, o no es el creador ni el anotador.
CREATE OR REPLACE FUNCTION public.liberar_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
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
  v_creador uuid;
  v_equipo_id uuid;
  v_anotador uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rl.creador_id
    INTO v_ronda_id, v_estado, v_es_demo, v_creador
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.anotador_user_id
      INTO v_equipo_id, v_anotador
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
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  -- IS NOT DISTINCT FROM: con anotador NULL, `=` daría NULL y el IF no cortaría.
  IF NOT (v_creador IS NOT DISTINCT FROM v_uid OR v_anotador IS NOT DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  -- anotador_nombre lo borra el trigger.
  UPDATE public.ronda_equipos SET anotador_user_id = NULL WHERE id = v_equipo_id AND anotador_user_id IS NOT NULL;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.liberar_equipo_de_ronda(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_equipo_de_ronda(text, uuid) TO authenticated;
