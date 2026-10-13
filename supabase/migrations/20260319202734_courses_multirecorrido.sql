-- ============================================================
-- Golfers+ — Migración 002: canchas multi-recorrido
-- Ejecutar en: Supabase > SQL Editor
-- Idempotente: seguro de re-ejecutar
-- ============================================================

-- ── 1. AMPLIAR courses con soporte multi-recorrido ──────────

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS tipo_recorrido   TEXT DEFAULT '18h',
  ADD COLUMN IF NOT EXISTS parent_id        UUID REFERENCES courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loop_nombre      TEXT,
  ADD COLUMN IF NOT EXISTS datos_verificados BOOLEAN DEFAULT false;

-- CHECK constraint en tipo_recorrido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'courses_tipo_recorrido_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_tipo_recorrido_check
      CHECK (tipo_recorrido IN ('9h','18h','27h','36h'));
  END IF;
END $$;

-- ── 2. TABLA course_tees (CR/Slope por tee) ──────────────────

CREATE TABLE IF NOT EXISTS course_tees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  yardaje_total INTEGER,
  par_total     INTEGER,
  rating        DECIMAL(4,1),
  slope         INTEGER,
  genero        TEXT DEFAULT 'M'
    CHECK (genero IN ('M','F','U')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (course_id, nombre)
);

-- RLS en course_tees
ALTER TABLE course_tees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'course_tees'
      AND policyname = 'course_tees_select_public'
  ) THEN
    CREATE POLICY course_tees_select_public
      ON course_tees FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'course_tees'
      AND policyname = 'course_tees_write_admin'
  ) THEN
    CREATE POLICY course_tees_write_admin
      ON course_tees FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 3. course_holes: unique constraint para upsert ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_holes'::regclass
      AND conname = 'course_holes_course_numero_key'
  ) THEN
    ALTER TABLE course_holes
      ADD CONSTRAINT course_holes_course_numero_key
      UNIQUE (course_id, numero);
  END IF;
END $$;

-- ── 4. historical_rounds: agregar course_id si no existe ────
ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;

-- ── 5. ÍNDICES de performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courses_tipo
  ON courses(tipo_recorrido);
CREATE INDEX IF NOT EXISTS idx_courses_parent
  ON courses(parent_id);
CREATE INDEX IF NOT EXISTS idx_courses_ciudad
  ON courses(ciudad);
CREATE INDEX IF NOT EXISTS idx_course_tees_course
  ON course_tees(course_id);
CREATE INDEX IF NOT EXISTS idx_historical_rounds_course
  ON historical_rounds(course_id);
