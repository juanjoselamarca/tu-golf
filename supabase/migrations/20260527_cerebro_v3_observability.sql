-- 20260527_cerebro_v3_observability.sql
-- Ola 0 del cerebro v3 — infraestructura transversal, parte 1.
--
-- Crea la tabla `cerebro_weights` para pesos paramétricos vivos del cerebro,
-- + trigger Postgres `pg_notify` que dispara invalidación distribuida de
-- cache cross-process (Supabase Realtime escucha el canal NOTIFY).
--
-- Nota de naming: el plan original lo llamó `037_cerebro_v3_observability.sql`,
-- pero ya existen dos migraciones con prefijo `037_` y la convención vigente
-- (memoria 10882, 24-may-2026) es `YYYYMMDD_descripcion.sql`. Adaptado.
--
-- Idempotente: se puede re-ejecutar sin efectos secundarios.

BEGIN;

-- 1) Pesos paramétricos vivos (modificables en vivo desde admin)
CREATE TABLE IF NOT EXISTS cerebro_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_type text NOT NULL CHECK (parameter_type IN ('block','pattern','source','user_cluster')),
  parameter_key text NOT NULL,
  current_weight numeric(5,4) NOT NULL CHECK (current_weight BETWEEN 0 AND 1),
  previous_weight numeric(5,4),
  user_cluster_id uuid,
  source text NOT NULL CHECK (source IN ('auto','manual','seed')),
  version integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  last_auto_update_at timestamptz,
  last_manual_override_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parameter_type, parameter_key, user_cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_cerebro_weights_lookup
  ON cerebro_weights (parameter_type, parameter_key)
  WHERE user_cluster_id IS NULL;

-- 2) Trigger para invalidación distribuida vía pg_notify
--    Supabase Realtime escucha sobre canales NOTIFY estándar.
CREATE OR REPLACE FUNCTION notify_cerebro_weights_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cerebro_weights_updated', json_build_object(
    'parameter_type', NEW.parameter_type,
    'parameter_key', NEW.parameter_key,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cerebro_weights_notify ON cerebro_weights;
CREATE TRIGGER trg_cerebro_weights_notify
AFTER INSERT OR UPDATE ON cerebro_weights
FOR EACH ROW EXECUTE FUNCTION notify_cerebro_weights_change();

-- 3) RLS — lectura pública (no son datos personales), escritura solo admin
ALTER TABLE cerebro_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerebro_weights_read_public" ON cerebro_weights;
CREATE POLICY "cerebro_weights_read_public"
  ON cerebro_weights FOR SELECT USING (true);

DROP POLICY IF EXISTS "cerebro_weights_write_admin" ON cerebro_weights;
CREATE POLICY "cerebro_weights_write_admin"
  ON cerebro_weights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

COMMIT;
