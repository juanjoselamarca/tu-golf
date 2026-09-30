-- 20260929b — P0 seguridad, FASE 1 de 2 (aditiva): funciones nuevas.
--
-- Contexto completo en 20260929c. Esta fase solo CREA funciones y no cambia
-- ningún permiso existente, así que se aplica ANTES de deployar el cliente
-- que las usa (finalizar/descartar vía RPC). La fase 2 (20260929c) cierra el
-- hueco y se aplica DESPUÉS de que ese deploy esté en producción: si se
-- cerrara antes, el cliente viejo (UPDATE/DELETE directo) fallaría en
-- silencio al finalizar como invitado y al reclamar tarjetas de invitado.
--
-- Idempotente.

-- ─── 3. "¿Quién puede anotar en esta ronda?" — una sola fuente ──────────────
-- SECURITY DEFINER para que las funciones que la usan no dependan de las
-- policies de lectura y para poder llamarla desde otras DEFINER sin recursión.

CREATE OR REPLACE FUNCTION public.puede_anotar_ronda(p_ronda_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    -- creador o marcador designado (admin_mode: admin_user_id anota por todos)
    EXISTS (SELECT 1 FROM public.rondas_libres r
            WHERE r.id = p_ronda_id
              AND (r.creador_id = auth.uid() OR r.admin_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
               WHERE j.ronda_id = p_ronda_id AND j.user_id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.puede_anotar_ronda(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.puede_anotar_ronda(uuid) TO authenticated, service_role;

-- ─── 6. Finalizar ronda ─────────────────────────────────────────────────────
-- Devuelve true si la cerró, false si ya no estaba en_curso. Quién puede:
--   - creador o jugador con cuenta de la ronda, siempre;
--   - sin sesión (invitado que termina último), solo si TODOS los jugadores
--     tienen todos los hoyos anotados — cerrar una ronda completa no altera
--     ningún score. Es exactamente la condición que el cliente ya exigía.

CREATE OR REPLACE FUNCTION public.finalizar_ronda_libre(p_codigo text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_holes int;
  v_completa boolean;
BEGIN
  SELECT id, estado, es_demo, COALESCE(holes, 18)
    INTO v_id, v_estado, v_es_demo, v_holes
  FROM public.rondas_libres
  WHERE codigo = p_codigo
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RETURN false;
  END IF;

  IF NOT public.puede_anotar_ronda(v_id) THEN
    -- Sin autoría sobre la ronda: solo se acepta cerrar una ronda completa.
    SELECT bool_and(
      (SELECT count(*) FROM jsonb_object_keys(COALESCE(j.scores, '{}'::jsonb)) k
       WHERE k ~ '^[0-9]+$' AND k::int BETWEEN 1 AND v_holes) >= v_holes
    ) INTO v_completa
    FROM public.ronda_libre_jugadores j
    WHERE j.ronda_id = v_id;

    IF NOT COALESCE(v_completa, false) THEN
      RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  UPDATE public.rondas_libres
  SET estado = 'finalizada'
  WHERE id = v_id AND estado = 'en_curso';

  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalizar_ronda_libre(text) FROM public;
GRANT  EXECUTE ON FUNCTION public.finalizar_ronda_libre(text) TO anon, authenticated, service_role;

-- ─── 6b. Descartar ronda ────────────────────────────────────────────────────
-- Antes el cliente hacía dos DELETE sueltos (jugadores y ronda) y el botón se
-- mostraba a todos: gracias al hueco, cualquier jugador o invitado podía
-- borrar la ronda entera de otro. Ahora: solo el creador, en una sola
-- transacción (jugadores/equipos/pairings caen por ON DELETE CASCADE), y
-- nunca una ronda de torneo (la referencia tournament_groups).

CREATE OR REPLACE FUNCTION public.descartar_ronda_libre(p_codigo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_creador uuid;
  v_es_demo boolean;
BEGIN
  SELECT id, creador_id, es_demo INTO v_id, v_creador, v_es_demo
  FROM public.rondas_libres
  WHERE codigo = p_codigo
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo OR auth.uid() IS NULL OR v_creador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.ronda_libre_id = v_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;

  DELETE FROM public.rondas_libres WHERE id = v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.descartar_ronda_libre(text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.descartar_ronda_libre(text) TO authenticated, service_role;

-- ─── 7. RPC huérfano (no está en el repo, nadie lo llama): sin anon ──────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_ronda_player_scores'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.merge_ronda_player_scores(uuid, jsonb) FROM public, anon';
  END IF;
END $$;

-- ─── 8. Auditoría de policies para el canario (solo service_role) ───────────

CREATE OR REPLACE FUNCTION public.rls_write_policies_audit()
RETURNS TABLE (
  tablename text,
  policyname text,
  permissive text,
  roles text[],
  cmd text,
  qual text,
  with_check text
)
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p.tablename::text, p.policyname::text, p.permissive::text,
         p.roles::text[], p.cmd::text, p.qual::text, p.with_check::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
  ORDER BY p.tablename, p.cmd, p.policyname;
$$;
REVOKE EXECUTE ON FUNCTION public.rls_write_policies_audit() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rls_write_policies_audit() TO service_role;
