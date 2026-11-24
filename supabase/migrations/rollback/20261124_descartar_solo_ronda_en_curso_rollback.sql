-- Rollback de 20261124120000_descartar_solo_ronda_en_curso: vuelve descartar_ronda_libre a la versión del baseline
-- (sin mirar el estado: una ronda finalizada se puede borrar). Solo si la migración rompe algo.

CREATE OR REPLACE FUNCTION public.descartar_ronda_libre(p_codigo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  BEGIN
    DELETE FROM public.rondas_libres WHERE id = v_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- p. ej. taiger_sessions (NO ACTION): la ronda tiene datos asociados.
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda con datos asociados';
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.descartar_ronda_libre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_ronda_libre(text) TO authenticated, service_role;
