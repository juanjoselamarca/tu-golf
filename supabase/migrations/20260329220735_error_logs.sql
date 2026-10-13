-- Sistema de error logging interno — Golfers+
-- Ejecutado en producción el 29 Mar 2026

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL DEFAULT 'error'
    CHECK (level IN ('info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  source TEXT,
  page TEXT,
  user_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created
  ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved
  ON error_logs(resolved, created_at DESC);
