-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 017 — Formatos de juego + datos de cancha mejorados
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. course_tees: ratings de 9 hoyos + bogey rating ─────────────────
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS front_course_rating DECIMAL(4,1);
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS front_slope_rating INTEGER;
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS front_bogey_rating DECIMAL(4,1);
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS back_course_rating DECIMAL(4,1);
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS back_slope_rating INTEGER;
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS back_bogey_rating DECIMAL(4,1);
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS bogey_rating DECIMAL(4,1);
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS total_yards INTEGER;
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS total_meters INTEGER;

-- ─── 2. tournaments: snapshot + custom SI ──────────────────────────────
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS custom_stroke_index JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS course_snapshot JSONB;

-- ─── 3. rondas_libres: snapshot + custom SI ────────────────────────────
ALTER TABLE rondas_libres ADD COLUMN IF NOT EXISTS custom_stroke_index JSONB;
ALTER TABLE rondas_libres ADD COLUMN IF NOT EXISTS course_snapshot JSONB;

-- ─── 4. SI comunitario: propuestas de stroke index ─────────────────────
CREATE TABLE IF NOT EXISTS course_si_proposals (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  proposed_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stroke_index JSONB NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE course_si_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_si_proposals" ON course_si_proposals;
CREATE POLICY "own_si_proposals" ON course_si_proposals
  FOR ALL USING (auth.uid() = proposed_by);

-- ─── 5. courses: flag para SI verificado ───────────────────────────────
ALTER TABLE courses ADD COLUMN IF NOT EXISTS si_verificado BOOLEAN DEFAULT FALSE;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Todo idempotente
-- ═══════════════════════════════════════════════════════════════════════════
