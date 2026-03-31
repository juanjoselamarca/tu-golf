-- ============================================================
-- Golfers+ · Migración 013: Tabla de reglas de golf
-- 30 marzo 2026
-- ============================================================

CREATE TABLE IF NOT EXISTS golf_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  rule_key TEXT NOT NULL UNIQUE,
  rule_data JSONB NOT NULL,
  description TEXT,
  source TEXT,
  version TEXT DEFAULT '2024',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: lectura pública, escritura solo admin
ALTER TABLE golf_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read golf_rules"
  ON golf_rules FOR SELECT USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_golf_rules_category ON golf_rules(category);
CREATE INDEX IF NOT EXISTS idx_golf_rules_key ON golf_rules(rule_key);

-- ─── Reglas core ───

INSERT INTO golf_rules (category, rule_key, rule_data, description, source) VALUES
  ('scoring', 'stableford_points',
   '{"albatross_or_better": 5, "eagle": 4, "birdie": 3, "par": 2, "bogey": 1, "double_bogey_or_worse": 0}',
   'Puntos Stableford estándar (neto)',
   'USGA'),

  ('tiebreak', 'countback_order',
   '["back_9", "back_6", "back_3", "hole_18", "hole_by_hole_from_1"]',
   'Orden de desempate USGA por countback',
   'USGA'),

  ('handicap', 'course_handicap_formula',
   '{"formula": "handicap_index * (slope_rating / 113) + (course_rating - par)", "round": "nearest_integer"}',
   'Fórmula de handicap de cancha WHS 2024',
   'WHS'),

  ('handicap', 'stroke_allocation',
   '{"method": "stroke_index", "max_strokes_per_hole": 2, "extra_strokes_start_from_si": 1}',
   'Distribución de golpes por stroke index',
   'WHS'),

  ('format', 'scramble_handicap_2p',
   '{"lower_handicap_pct": 0.35, "higher_handicap_pct": 0.15}',
   'Handicap de equipo scramble 2 jugadores',
   'USGA'),

  ('format', 'scramble_handicap_4p',
   '{"1st_lowest_pct": 0.25, "2nd_lowest_pct": 0.20, "3rd_lowest_pct": 0.15, "4th_lowest_pct": 0.10}',
   'Handicap de equipo scramble 4 jugadores',
   'USGA'),

  ('format', 'foursomes_handicap',
   '{"formula": "(player_a_handicap + player_b_handicap) / 2", "round": "nearest_0.5"}',
   'Handicap de equipo foursomes (tiro alternado)',
   'WHS'),

  ('format', 'match_play_strokes',
   '{"method": "difference_distributed_by_stroke_index", "description": "La diferencia de handicap se distribuye por SI, el de menor HCP juega scratch"}',
   'Distribución de golpes en match play',
   'USGA')

ON CONFLICT (rule_key) DO NOTHING;

COMMENT ON TABLE golf_rules IS 'Reglas oficiales de golf parametrizadas. Fuente de verdad para cálculos del motor.';
