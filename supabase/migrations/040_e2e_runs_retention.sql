-- Migration 040 — Retención y caps para e2e_runs
--
-- Cierra dos hallazgos P1 del code review 2026-05-10:
--   - P1-3: tabla sin TTL ni cap de tamaño → crecimiento ilimitado.
--           A 10 runs/día, ~500MB/año (cada fila puede tener 100KB+ de
--           results jsonb con stacks de error).
--   - P2-5: enum de status no incluía estados terminales para casos
--           reales: workflow cancelado manualmente o atascado en
--           'running' sin callback final.
--
-- Cambios:
-- 1. Index nuevo (status, created_at DESC) para queries del panel admin.
-- 2. CHECK constraint defensivo: cada fila < 1MB. Si el callback intenta
--    persistir más (ya hay cap del lado API en zod, esto es defensa en
--    profundidad), el INSERT falla con violación explícita.
-- 3. Ampliar enum a 'cancelled' y 'timeout' como estados terminales para
--    el job de cleanup.
-- 4. Función SQL `cleanup_old_e2e_runs()` que marca como 'timeout' los
--    runs > 30min en 'queued'/'running' (callback perdido) y borra los
--    terminales > 90 días. Idempotente; segura de correr varias veces.

-- 1. Index compuesto para el panel admin (ORDER BY created_at DESC WHERE status IN ...)
CREATE INDEX IF NOT EXISTS e2e_runs_status_created_idx
  ON public.e2e_runs (status, created_at DESC);

-- 2. Cap de tamaño por fila (defensa en profundidad — el zod del callback ya
--    limita el array a 500 elementos, pero esto cubre rutas alternativas).
ALTER TABLE public.e2e_runs
  DROP CONSTRAINT IF EXISTS e2e_runs_size_check;
ALTER TABLE public.e2e_runs
  ADD CONSTRAINT e2e_runs_size_check
  CHECK (octet_length(results::text) < 1048576); -- 1 MB

-- 3. Ampliar el enum de status. CHECK constraint no soporta ALTER directo,
--    así que drop + add. Idempotente vía CASE WHEN.
ALTER TABLE public.e2e_runs
  DROP CONSTRAINT IF EXISTS e2e_runs_status_check;
ALTER TABLE public.e2e_runs
  ADD CONSTRAINT e2e_runs_status_check
  CHECK (status IN ('queued', 'running', 'passed', 'failed', 'error', 'cancelled', 'timeout'));

-- 4. Función de cleanup. Pensada para ser invocada por pg_cron o por un
--    endpoint admin manual. Devuelve cantidades para que el caller logueé.
CREATE OR REPLACE FUNCTION public.cleanup_old_e2e_runs()
RETURNS TABLE (timed_out int, deleted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timed_out int;
  v_deleted int;
BEGIN
  -- Marca como timeout los runs activos sin update en >30 min.
  -- Caso típico: workflow cancelado manualmente desde GH UI, callback
  -- perdido por error de red, o crash de runner.
  UPDATE public.e2e_runs
    SET status = 'timeout',
        finished_at = NOW(),
        error_message = COALESCE(error_message, '') ||
          E'\n[cleanup] Run estancado >30min sin update final. Marcado timeout automáticamente.'
    WHERE status IN ('queued', 'running')
      AND started_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS v_timed_out = ROW_COUNT;

  -- Borra runs terminales > 90 días. Mantiene historia reciente útil para
  -- diagnóstico, sin acumular gigas en jsonb.
  DELETE FROM public.e2e_runs
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND status IN ('passed', 'failed', 'error', 'cancelled', 'timeout');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_timed_out, v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_e2e_runs IS
  'Marca runs estancados como timeout (>30min sin callback) y borra terminales >90 días. Idempotente. Invocar desde pg_cron o /api/admin/e2e/cleanup.';
