-- ============================================================
-- Golfers+ — Migración 003: preparar historical_rounds para importación
-- Ejecutar en: Supabase > SQL Editor
-- Idempotente: seguro de re-ejecutar
-- ============================================================

-- ── 1. Nuevas columnas para importación ─────────────────────

ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- CHECK constraint en source
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'historical_rounds'::regclass
      AND conname = 'historical_rounds_source_check'
  ) THEN
    ALTER TABLE historical_rounds
      ADD CONSTRAINT historical_rounds_source_check
      CHECK (source IN ('manual', 'ronda_libre', 'photo_scan', 'garmin', 'csv', 'import'));
  END IF;
END $$;

-- ── 2. Marcar rondas existentes como fuente correcta ────────

-- Las que vinieron de rondas libres
UPDATE historical_rounds
  SET source = 'ronda_libre'
  WHERE source = 'manual'
    AND notes IS NULL
    AND privacy = 'private';

-- ── 3. Índices para queries de stats ────────────────────────

CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_played
  ON historical_rounds(user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_historical_rounds_source
  ON historical_rounds(source);

-- ── 4. Normalizar scores: convertir objetos {"1":4,"2":5} a arrays [4,5] ──
-- Solo para rondas donde scores es un objeto con claves numéricas
-- Esto se hará en el script de seed, no en SQL

-- ── 5. Vista materializada para stats rápidas (opcional, para scale) ──
-- Por ahora no se crea — las queries directas son suficientes con 244 rondas
