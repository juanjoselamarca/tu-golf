-- Golfers+ — Migración 004: Import jobs + CPI cache
-- Ejecutar en Supabase SQL Editor

-- 1. New columns in historical_rounds (only ones that DON'T already exist)
-- 'source' and 'metadata' already exist from migration 003
ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS import_confidence DECIMAL(3,2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS holes_played INTEGER;

-- 2. CPI cache in profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cpi_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS cpi_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpi_trend DECIMAL(6,4),
  ADD COLUMN IF NOT EXISTS cpi_status TEXT DEFAULT 'insufficient_data';

-- 3. Import jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_detected INTEGER DEFAULT 0,
  total_valid INTEGER DEFAULT 0,
  total_excluded INTEGER DEFAULT 0,
  total_imported INTEGER DEFAULT 0,
  raw_data JSONB,
  mapped_data JSONB,
  errors JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='import_jobs' AND policyname='import_jobs_select_own') THEN
    CREATE POLICY import_jobs_select_own ON import_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='import_jobs' AND policyname='import_jobs_insert_own') THEN
    CREATE POLICY import_jobs_insert_own ON import_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='import_jobs' AND policyname='import_jobs_update_own') THEN
    CREATE POLICY import_jobs_update_own ON import_jobs FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_id);
