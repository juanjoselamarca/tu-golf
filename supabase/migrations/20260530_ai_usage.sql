-- 20260530_ai_usage.sql
--
-- Fase 2 del AI Gateway: observabilidad de consumo de IA.
-- Cada callLLM() inserta un row (best-effort, fire-and-forget) con el resultado:
-- proveedor/modelo usado, si hubo fallback, reintentos, tokens, latencia, costo
-- estimado y el tipo de error cuando degradó. Alimenta el dashboard admin + la
-- alerta temprana del cron (avisar al 70%, no enterarnos por un mail de Anthropic).
--
-- Spec: docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md §3.6
-- RLS: service_role inserta/lee todo; admins leen.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  ai_env        text NOT NULL,                       -- 'prod' | 'dev'
  role          text NOT NULL,                       -- evaluator | primary_chat | reasoning
  provider      text,                                -- anthropic | google (null si nunca llegó a un proveedor)
  model         text,                                -- model id usado (null si all_failed)
  status        text NOT NULL,                       -- 'ok' | 'all_failed'
  fallback_used boolean NOT NULL DEFAULT false,      -- true si no fue el primer proveedor de la cadena
  attempts      int NOT NULL DEFAULT 0,              -- intentos totales (reintentos + saltos)
  tokens_in     int NOT NULL DEFAULT 0,
  tokens_out    int NOT NULL DEFAULT 0,
  latency_ms    int NOT NULL DEFAULT 0,
  cost_usd      numeric(12,8) NOT NULL DEFAULT 0,
  error_kind    text                                 -- 'rate_limit' | 'overloaded' | 'timeout' | 'other' (si hubo fallback o all_failed)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created    ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_problems   ON ai_usage (created_at DESC)
  WHERE status <> 'ok' OR fallback_used = true;

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_service_all ON ai_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY ai_usage_admin_read ON ai_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

COMMIT;
