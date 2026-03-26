-- tAIger+ Learning System — Migration SQL (idempotent)
-- Tables: taiger_recommendations, taiger_feedback, collective_insights
-- Column: taiger_sessions.rating

-- ============================================================
-- 1. taiger_recommendations
-- ============================================================
CREATE TABLE IF NOT EXISTS taiger_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES taiger_sessions(id) ON DELETE SET NULL,
  recommendation TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('technique', 'mental', 'practice', 'strategy')),
  focus_area TEXT NOT NULL CHECK (focus_area IN ('driving', 'approach', 'short_game', 'putting', 'mental', 'course_management')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'improving', 'resolved', 'ineffective')),
  score_before DECIMAL,
  score_after DECIMAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_taiger_recommendations_user
  ON taiger_recommendations (user_id, status);

ALTER TABLE taiger_recommendations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_recommendations' AND policyname = 'Users can read own recommendations'
  ) THEN
    CREATE POLICY "Users can read own recommendations"
      ON taiger_recommendations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_recommendations' AND policyname = 'Users can insert own recommendations'
  ) THEN
    CREATE POLICY "Users can insert own recommendations"
      ON taiger_recommendations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_recommendations' AND policyname = 'Users can update own recommendations'
  ) THEN
    CREATE POLICY "Users can update own recommendations"
      ON taiger_recommendations FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 2. taiger_feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS taiger_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taiger_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taiger_feedback_session
  ON taiger_feedback (session_id);

CREATE INDEX IF NOT EXISTS idx_taiger_feedback_user
  ON taiger_feedback (user_id);

ALTER TABLE taiger_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_feedback' AND policyname = 'Users can read own feedback'
  ) THEN
    CREATE POLICY "Users can read own feedback"
      ON taiger_feedback FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_feedback' AND policyname = 'Users can insert own feedback'
  ) THEN
    CREATE POLICY "Users can insert own feedback"
      ON taiger_feedback FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 3. collective_insights
-- ============================================================
CREATE TABLE IF NOT EXISTS collective_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  handicap_range TEXT NOT NULL CHECK (handicap_range IN ('0-5', '5-10', '10-15', '15-20', '20-30', '30+')),
  insight TEXT NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence DECIMAL NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collective_insights_range
  ON collective_insights (handicap_range);

-- Unique constraint for upsert in cron job
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_collective_insights_pattern_range'
  ) THEN
    ALTER TABLE collective_insights ADD CONSTRAINT uq_collective_insights_pattern_range
      UNIQUE (pattern_type, handicap_range);
  END IF;
END $$;

ALTER TABLE collective_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'collective_insights' AND policyname = 'Authenticated users can read collective insights'
  ) THEN
    CREATE POLICY "Authenticated users can read collective insights"
      ON collective_insights FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Service role can insert/update collective_insights (used by cron)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'collective_insights' AND policyname = 'Service role can manage collective insights'
  ) THEN
    CREATE POLICY "Service role can manage collective insights"
      ON collective_insights FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 4. Add rating column to taiger_sessions
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'taiger_sessions' AND column_name = 'rating'
  ) THEN
    ALTER TABLE taiger_sessions ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;
