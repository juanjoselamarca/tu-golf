-- Tabla e2e_runs: registro de corridas de tests E2E (Playwright) disparadas
-- desde el panel admin. Cada fila es una corrida individual.
--
-- Lifecycle: queued → running → passed | failed | error
--   queued: el endpoint /api/admin/e2e/run insertó la fila y disparó el
--     workflow_dispatch en GitHub. Aún no empezó a correr.
--   running: el workflow notificó que arrancó.
--   passed: todos los tests pasaron (failed = 0).
--   failed: al menos 1 test falló.
--   error: el workflow crasheó antes de poder reportar resultados.
--
-- El callback del workflow (GH → Supabase) usa SERVICE_ROLE_KEY y bypassa RLS.
-- Los reads y triggers desde la UI van por el cliente del usuario y respetan
-- las policies de admin de abajo.

CREATE TABLE public.e2e_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lifecycle
  status text NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'error')),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- GitHub Actions linkage (se llenan cuando arranca el workflow)
  github_run_id bigint,
  github_run_url text,

  -- Metadata de la corrida
  branch text,
  commit_sha text,
  base_url text,

  -- Timestamps
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,

  -- Resultados (se llenan al completar)
  --   summary: { total, passed, failed, skipped }
  --   results: array de tests, cada uno { name, status, duration_ms, error? }
  summary jsonb DEFAULT '{"total": 0, "passed": 0, "failed": 0, "skipped": 0}'::jsonb,
  results jsonb DEFAULT '[]'::jsonb,
  error_message text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX e2e_runs_status_idx ON public.e2e_runs (status);
CREATE INDEX e2e_runs_created_at_desc_idx ON public.e2e_runs (created_at DESC);
CREATE INDEX e2e_runs_triggered_by_idx ON public.e2e_runs (triggered_by);

-- RLS: solo admins pueden leer/insertar/actualizar desde la UI.
-- El SERVICE_ROLE_KEY que usa el workflow callback bypassa RLS por default.
ALTER TABLE public.e2e_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY e2e_runs_select_admin ON public.e2e_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY e2e_runs_insert_admin ON public.e2e_runs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY e2e_runs_update_admin ON public.e2e_runs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.e2e_runs IS
  'Corridas de tests E2E disparadas desde /admin/e2e. Tracking de status, resultados y enlace a GitHub Actions run.';
