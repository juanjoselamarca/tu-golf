-- Un equipo que anota otro celular lo escribe solo ese celular (scramble rápido, PR4: un celular por equipo).
--
-- 20261123100000_scramble_equipos_de_club dejó al creador (y a quien pasa puede_anotar_ronda) escribir cualquier
-- equipo, también uno reclamado por otra cuenta. Con dos celulares anotando el mismo equipo, el último guardado pisa
-- al otro hoyo por hoyo sin que nadie lo vea. El cliente ya no lo intenta, pero la regla tiene que ser del servidor:
--
--   · upsert_ronda_equipos_scores: si el equipo (de club, ronda sin admin_mode) tiene anotador y no es quien llama, P0003 (DETAIL
--     equipo_de_otro_anotador). service_role sigue pasando. El creador libera el equipo y recién ahí lo anota.
--   · ronda_equipos_scores_de_su_anotador: la policy manage_ronda_equipos deja al creador escribir la fila entera;
--     el trigger cierra ese camino para scores de un equipo con anotador ajeno (anon/authenticated; las RPC SECURITY
--     DEFINER y service_role pasan).
--
-- Prueba: scripts/ci/pruebas-sql/equipos-de-club.sql. Idempotente.
-- Rollback: supabase/migrations/rollback/20261123_equipo_tomado_lo_escribe_su_anotador_rollback.sql

-- ── upsert_ronda_equipos_scores: el equipo tomado solo lo escribe su anotador ───────────────────────────────────
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
  -- bajo su lock. puede_anotar_ronda (creador, marcador, jugadores) escribe los equipos SIN anotador (ver abajo).
  -- IS NOT DISTINCT FROM y no `=`: con el equipo sin anotador, `NULL = uid` es NULL y NOT (false OR NULL) también,
  -- y el IF no cortaría. La rama del anotador vale solo en un equipo de club de una ronda de un celular por equipo
  -- (admin_mode no TRUE). Rondas de torneo y demo no llegan acá con anotador: reclamar_equipo_de_ronda las rechaza
  -- y ronda_equipos_anotador_guard impide asignarlo desde el cliente (la demo, además, corta arriba).
  IF NOT (
    v_is_service
    OR (auth.uid() IS NOT NULL AND (
      public.puede_anotar_ronda(v_ronda_id)
      OR (v_origen = 'club' AND v_admin_mode IS NOT TRUE AND v_anotador IS NOT DISTINCT FROM auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  -- Un equipo con anotador lo escribe SOLO su anotador: tampoco el creador ni los jugadores (puede_anotar_ronda).
  -- Sin esto, el celular del creador y el del equipo podían pisarse el mismo hoyo (gana el último en llegar).
  -- Para anotarlo él, el creador lo libera primero (liberar_equipo_de_ronda). v_anotador se leyó bajo el FOR UPDATE.
  -- Mismo predicado que la rama del anotador de arriba (equipo de club, ronda sin admin_mode): fuera de él un
  -- anotador no da derechos, así que tampoco los quita (el creador sigue anotando, como en toda ronda de un celular).
  IF NOT v_is_service AND v_origen = 'club' AND v_admin_mode IS NOT TRUE
     AND v_anotador IS NOT NULL AND v_anotador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo_de_otro_anotador';
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

-- ── Por la tabla tampoco: scores de un equipo con anotador solo los cambia ese anotador ─────────────────────────
-- SIN SECURITY DEFINER: current_user tiene que ser el de quien escribe (como ronda_equipos_anotador_guard).
CREATE OR REPLACE FUNCTION public.ronda_equipos_scores_de_su_anotador()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Mismo predicado que upsert_ronda_equipos_scores. Si RLS no deja leer la ronda, admin_mode sale NULL y bloquea.
  IF current_user IN ('anon', 'authenticated')
     AND OLD.handicap_origen = 'club'
     AND (SELECT rl.admin_mode FROM public.rondas_libres rl WHERE rl.id = OLD.ronda_id) IS NOT TRUE
     AND OLD.anotador_user_id IS NOT NULL
     AND OLD.anotador_user_id IS DISTINCT FROM auth.uid()
     AND NEW.scores IS DISTINCT FROM OLD.scores THEN
    RAISE EXCEPTION 'EQUIPO_DE_OTRO_ANOTADOR' USING ERRCODE = '42501',
      DETAIL = 'este equipo lo anota otro celular; para anotarlo tú, libéralo primero';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ronda_equipos_scores_de_su_anotador() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ronda_equipos_scores_de_su_anotador ON public.ronda_equipos;
CREATE TRIGGER ronda_equipos_scores_de_su_anotador
  BEFORE UPDATE OF scores ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_scores_de_su_anotador();
