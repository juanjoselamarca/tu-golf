-- 20260615_cerebro_v3_ola1b_external_priors.sql
-- Cerebro V3 — Sub-ola 1b: priors externos por capas.
-- Capa A (amateur_benchmarks): prior por-hándicap que calibra al novato (shrinkage).
-- Capa B (handicap_dist): distribución poblacional para ranking.
-- Capa C (course_norms): normas de dificultad de cancha.
-- RLS: datos agregados no personales → lectura pública, escritura service_role
-- (espejo de knowledge_sources, 20260528_ola1e_knowledge_sources.sql).

-- knowledge_sources.jurisdiction tiene CHECK con lista cerrada; agregamos el valor
-- para fuentes de priors externos. Idempotente.
ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_jurisdiction_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_jurisdiction_check
  CHECK (jurisdiction IN (
    'usga','randa','usga_committee','whs_global','fedegolf_chile','external_prior'
  ));

-- Capa A — benchmark por skill
CREATE TABLE IF NOT EXISTS external_priors_amateur_benchmarks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  handicap_bucket text NOT NULL,
  metric_key  text NOT NULL,
  percentile  integer NOT NULL CHECK (percentile BETWEEN 0 AND 100),
  value       numeric NOT NULL,
  sample_size integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, handicap_bucket, metric_key, percentile)
);
CREATE INDEX IF NOT EXISTS idx_amateur_bench_lookup
  ON external_priors_amateur_benchmarks (handicap_bucket, metric_key, percentile);

-- Capa B — distribución poblacional
CREATE TABLE IF NOT EXISTS external_priors_handicap_dist (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  region      text NOT NULL,
  gender      text NOT NULL DEFAULT 'all',       -- NOT NULL: evita 42P10 en la clave única
  age_bucket  text NOT NULL DEFAULT 'all',       -- idem
  handicap_bin text NOT NULL,
  proportion  numeric NOT NULL CHECK (proportion >= 0 AND proportion <= 1),
  year        integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, region, gender, age_bucket, handicap_bin, year)
);
CREATE INDEX IF NOT EXISTS idx_handicap_dist_lookup
  ON external_priors_handicap_dist (region, gender, handicap_bin);

-- Capa C — normas de cancha (bandas con course_external_id sintético no-NULL)
CREATE TABLE IF NOT EXISTS external_priors_course_norms (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  course_external_id text NOT NULL,              -- bandas: 'BAND:<region>:<par>'
  course_name text,
  region      text,
  par         integer,
  slope_rating integer,
  course_rating numeric,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, course_external_id)
);

-- RLS
ALTER TABLE external_priors_amateur_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_priors_handicap_dist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_priors_course_norms      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'external_priors_amateur_benchmarks',
    'external_priors_handicap_dist',
    'external_priors_course_norms'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_public_read ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_public_read ON %I FOR SELECT USING (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service_write ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_service_write ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;
