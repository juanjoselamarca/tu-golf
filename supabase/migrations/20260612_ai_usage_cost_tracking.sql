-- 20260612_ai_usage_cost_tracking.sql
--
-- PR-0 Medición real de costo de IA por item.
--
-- Agrega el corte de NEGOCIO a ai_usage para responder la pregunta de
-- rentabilidad: ¿cuánto cuesta un usuario activo al mes? ¿cuánto una
-- conversación del coach? El esquema previo (20260530_ai_usage) solo tenía el
-- corte TÉCNICO (role/provider/model) y NO contaba el caché de prompt — el coach
-- usa cache_control ephemeral agresivo, así que sin estas columnas el costo del
-- coach (su mayor consumidor) salía mal o ni se logueaba.
--
--  • user_id            → atribución por usuario (top-spenders, costo/usuario).
--  • surface            → corte por feature (coach_chat/import_*/torneos/eval).
--  • session_id         → sesión del coach (costo POR CONVERSACIÓN = ÷ sesiones distintas).
--  • cache_read_tokens  → input servido de caché (0.1× tarifa input).
--  • cache_write_tokens → input escrito a caché (1.25× tarifa input).
--
-- Aditivo y backward-compatible: columnas nullable / con default, los INSERT
-- viejos siguen funcionando. Idempotente (IF NOT EXISTS).
--
-- Spec: docs/superpowers/specs/2026-06-11-medicion-costo-ia-design.md

BEGIN;

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS user_id            uuid,
  ADD COLUMN IF NOT EXISTS surface            text,
  ADD COLUMN IF NOT EXISTS session_id         uuid,
  ADD COLUMN IF NOT EXISTS cache_read_tokens  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens int NOT NULL DEFAULT 0;

-- Cortes del dashboard: por superficie y por usuario, ambos ordenados por fecha.
CREATE INDEX IF NOT EXISTS idx_ai_usage_surface_created ON ai_usage (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created    ON ai_usage (user_id, created_at DESC);

COMMIT;
