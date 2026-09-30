-- 20260929c — P0 seguridad, FASE 2 de 2: las guardas "demo read-only" eran PERMISSIVE.
--
-- Qué pasaba. La migración 028 creó en rondas_libres, ronda_libre_jugadores y
-- tournaments un par de policies UPDATE/DELETE con USING (es_demo = false) para
-- que nadie pudiera tocar los registros sembrados de /demo. Pero una policy
-- PERMISSIVE no restringe: se une con OR a las demás. Resultado: cualquier
-- visitante con la anon key podía hacer UPDATE/DELETE sobre CUALQUIER ronda,
-- tarjeta o torneo que no fuera demo (verificado el 29-sep-2026 con un UPDATE
-- anónimo dentro de una transacción con rollback: 1 fila afectada).
--
-- Qué hace esta migración.
--   1. Recrea las 6 guardas de demo AS RESTRICTIVE (misma semántica: bloquean
--      lo demo, no otorgan nada). Una RESTRICTIVE se combina con AND.
--   2. rondas_libres no tenía policy de DELETE para el creador: "Descartar
--      ronda" funcionaba SOLO gracias al hueco. Se agrega `eliminar_ronda`.
--   3. Los RPCs de score pasan a SECURITY DEFINER con la autorización explícita
--      adentro (una sola fuente para "¿quién puede anotar?"):
--        - creador, marcador designado (admin_user_id) o jugador con cuenta
--          de la ronda → anota. service_role (panel admin) también.
--        - tarjeta sin cuenta vinculada (user_id null: invitado, o rival
--          agregado "Con cuenta" que hoy se guarda sin vincular) → se anota
--          con el código de la ronda, sin sesión. Es el flujo real de la
--          PantallaCompartir ("Únete a mi ronda" → /score) y hasta hoy
--          funcionaba únicamente porque el hueco dejaba escribir a cualquiera.
--          Queda acotado a ESA tarjeta, con la ronda en curso y no demo.
--        - 0 filas ya no es un éxito silencioso: RONDA_FORBIDDEN (P0003).
--   (En 20260929b: `finalizar_ronda_libre` y `descartar_ronda_libre`, que
--   reemplazan el UPDATE/DELETE directo del cliente que pasaba por el hueco,
--   y `rls_write_policies_audit()` para el canario de integración.)
--
-- Requiere 20260929b (puede_anotar_ronda) y el cliente que usa los RPCs ya
-- deployado. Idempotente. Dry-run con rollback antes de aplicar (ver PR).

-- ─── 1. Guardas demo → RESTRICTIVE ──────────────────────────────────────────

DROP POLICY IF EXISTS rondas_libres_demo_readonly_update ON public.rondas_libres;
DROP POLICY IF EXISTS rondas_libres_demo_readonly_delete ON public.rondas_libres;
CREATE POLICY rondas_libres_demo_readonly_update ON public.rondas_libres
  AS RESTRICTIVE FOR UPDATE
  USING (es_demo = false) WITH CHECK (es_demo = false);
CREATE POLICY rondas_libres_demo_readonly_delete ON public.rondas_libres
  AS RESTRICTIVE FOR DELETE
  USING (es_demo = false);

DROP POLICY IF EXISTS rlj_demo_readonly_update ON public.ronda_libre_jugadores;
DROP POLICY IF EXISTS rlj_demo_readonly_delete ON public.ronda_libre_jugadores;
CREATE POLICY rlj_demo_readonly_update ON public.ronda_libre_jugadores
  AS RESTRICTIVE FOR UPDATE
  USING (NOT EXISTS (
    SELECT 1 FROM public.rondas_libres r
    WHERE r.id = ronda_libre_jugadores.ronda_id AND r.es_demo = true
  ));
CREATE POLICY rlj_demo_readonly_delete ON public.ronda_libre_jugadores
  AS RESTRICTIVE FOR DELETE
  USING (NOT EXISTS (
    SELECT 1 FROM public.rondas_libres r
    WHERE r.id = ronda_libre_jugadores.ronda_id AND r.es_demo = true
  ));

DROP POLICY IF EXISTS tournaments_demo_readonly_update ON public.tournaments;
DROP POLICY IF EXISTS tournaments_demo_readonly_delete ON public.tournaments;
CREATE POLICY tournaments_demo_readonly_update ON public.tournaments
  AS RESTRICTIVE FOR UPDATE
  USING (es_demo = false) WITH CHECK (es_demo = false);
CREATE POLICY tournaments_demo_readonly_delete ON public.tournaments
  AS RESTRICTIVE FOR DELETE
  USING (es_demo = false);

-- ─── 2. El creador puede borrar su ronda (Descartar ronda) ──────────────────

DROP POLICY IF EXISTS eliminar_ronda ON public.rondas_libres;
CREATE POLICY eliminar_ronda ON public.rondas_libres
  FOR DELETE TO authenticated
  USING (auth.uid() = creador_id);

-- ─── 4. RPC de scores individuales ──────────────────────────────────────────
-- Misma firma y mismo merge (`scores || delta`, lado derecho gana). Cambia:
-- SECURITY DEFINER + autorización explícita + error en vez de 0 filas.
-- Errcodes: P0001 RONDA_NOT_FOUND · P0002 RONDA_FINALIZED · P0003 RONDA_FORBIDDEN.

CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(
  p_jugador_id uuid,
  p_codigo text,
  p_delta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  -- NULL = no-op (compat con la versión anterior); cualquier no-objeto
  -- corrompería el merge `||`, así que se rechaza.
  IF p_delta IS NOT NULL AND jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rlj.user_id
    INTO v_ronda_id, v_estado, v_es_demo, v_user_id
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_libre_jugadores rlj ON rlj.ronda_id = rl.id
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo
  FOR UPDATE OF rlj;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  -- Autorización (única fuente):
  --   a) la tarjeta es mía (user_id = auth.uid())
  --   b) soy creador, marcador designado (admin_user_id) o jugador con cuenta
  --      de la ronda (marcador del grupo)
  --   c) tarjeta sin cuenta vinculada (user_id null): se anota con el código
  --      de la ronda. No se exige is_guest: el rival "Con cuenta" de
  --      TarjetaDeRival hoy se inserta con user_id null e is_guest false.
  --   Ampliación deliberada vs. la policy `jugador_update_scores` (tarjeta
  --   propia o creador): en ronda libre cualquier miembro con cuenta es
  --   marcador del grupo y anota todas las tarjetas. La policy queda solo
  --   para UPDATE directo (el cliente ya no lo usa para scores).
  --   d) service_role (panel admin: /api/admin/rondas-libres/[id]/scores)
  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id = v_uid OR public.puede_anotar_ronda(v_ronda_id)))
    OR v_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.ronda_libre_jugadores
  SET scores = COALESCE(scores, '{}'::jsonb) || COALESCE(p_delta, '{}'::jsonb)
  WHERE id = p_jugador_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb) FROM public;
GRANT  EXECUTE ON FUNCTION public.upsert_ronda_libre_scores(uuid, text, jsonb) TO anon, authenticated, service_role;

-- ─── 5. RPC de scores de equipo (scramble / foursome) ───────────────────────
-- Solo con sesión: score-grupo exige login. Creador o jugador de la ronda.
-- Antes era SECURITY INVOKER con policy creador-only: un jugador que no era el
-- creador (todos los grupos de torneo) recibía 0 filas SIN error y el cliente
-- mostraba "guardado". Ahora los miembros anotan y el resto recibe P0003.

CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(
  p_equipo_id uuid,
  p_codigo text,
  p_delta jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  -- NULL = no-op (compat con la versión anterior); cualquier no-objeto
  -- corrompería el merge `||`, así que se rechaza.
  IF p_delta IS NOT NULL AND jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo
    INTO v_ronda_id, v_estado, v_es_demo
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
  IF NOT (v_is_service OR public.puede_anotar_ronda(v_ronda_id)) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.ronda_equipos
  SET scores = COALESCE(scores, '{}'::jsonb) || COALESCE(p_delta, '{}'::jsonb)
  WHERE id = p_equipo_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_ronda_equipos_scores(uuid, text, jsonb) TO authenticated, service_role;

