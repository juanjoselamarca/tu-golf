-- 20260605_cerebro_v3_ola3_pattern_definitions.sql
-- Ola 3 "el cerebro guarda y crece" — chunk 1: catálogo declarativo de patrones.
-- Los 9 patrones salen del código a una tabla. Cambiar acción/peso/estado de un
-- patrón = UPDATE, no merge. El motor de foco (getFocus) lee de acá en runtime.
-- La matemática gen-0 sigue en código, ligada por pattern_key. Spec §8.4.

CREATE TABLE IF NOT EXISTS pattern_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  generation integer NOT NULL DEFAULT 0,
  formula_kind text NOT NULL CHECK (formula_kind IN ('aggregate','intra_round','cross_round','multivariate')),
  -- Metadata de binding del foco: { metric_key, accion, min_confidence, min_sample }.
  -- gen-0 ata la matemática por pattern_key en código; declarativo total = Ola 5.
  formula_payload jsonb NOT NULL,
  applicable_when jsonb,
  weight numeric(5,4) NOT NULL DEFAULT 0.5,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('seed','admin','discovered','imported')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','validating')),
  validation_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lectura pública (no son datos personales); escritura sólo service_role/admin.
ALTER TABLE pattern_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pattern_definitions_read ON pattern_definitions;
CREATE POLICY pattern_definitions_read ON pattern_definitions FOR SELECT USING (true);
DROP POLICY IF EXISTS pattern_definitions_service_write ON pattern_definitions;
CREATE POLICY pattern_definitions_service_write ON pattern_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed: los 9 patrones gen-0 (metadata = espejo de FOCUS_CATALOG en código) ──
INSERT INTO pattern_definitions (pattern_key, name, formula_kind, source, formula_payload) VALUES
  ('post_bogey_spiral', 'Espiral post-bogey', 'aggregate', 'seed',
   jsonb_build_object('metric_key','post_bogey_score_avg','min_confidence',0.5,'min_sample',3,
     'accion','Haz un reset de 4 pasos después de cada bogey: suelta el hoyo, respira, visualiza el próximo tiro y comprométete. El hoyo anterior no existe.')),
  ('back_nine_collapse', 'Caída en back nine', 'aggregate', 'seed',
   jsonb_build_object('metric_key','back9_minus_front9_strokes','min_confidence',0.5,'min_sample',3,
     'accion','Cuida la energía: hidrátate, come algo en el hoyo 10 y haz un reset mental antes de arrancar el back nine.')),
  ('front_nine_struggles', 'Arranque lento', 'aggregate', 'seed',
   jsonb_build_object('metric_key','back9_minus_front9_strokes','min_confidence',0.5,'min_sample',3,
     'accion','Arma una rutina pre-ronda: 15 min en el putting green y unas respiraciones lentas (4-4-6) antes del primer tee.')),
  ('first_hole_anxiety', 'Ansiedad en hoyo 1', 'aggregate', 'seed',
   jsonb_build_object('metric_key','avg_first_hole_score','min_confidence',0.4,'min_sample',3,
     'accion','Antes del primer tee, ánclate en quién eres como jugador y define un plan claro para ese tiro. El hoyo 1 no define tu ronda.')),
  ('par_3_weakness', 'Debilidad en par 3', 'aggregate', 'seed',
   jsonb_build_object('metric_key','par3_avg_vs_par','min_confidence',0.5,'min_sample',3,
     'accion','Práctica deliberada con hierros largos. Foco en distancia de carry, no en resultado.')),
  ('pressure_deterioration', 'Deterioro en el cierre', 'aggregate', 'seed',
   jsonb_build_object('metric_key','last4holes_minus_rest_strokes','min_confidence',0.5,'min_sample',3,
     'accion','Rutina pre-shot extendida en los últimos 4 hoyos. Respiración cuadrada antes del 15.')),
  ('driving_inconsistency', 'Alta dispersión total', 'cross_round', 'seed',
   jsonb_build_object('metric_key','total_gross_cv','min_confidence',0.5,'min_sample',5,
     'accion','Jornada de range con foco en consistencia de driver — 60 bolas a un solo objetivo.')),
  ('short_game_weakness', 'Juego corto débil', 'aggregate', 'seed',
   jsonb_build_object('metric_key','short_game_strokes_per_round','min_confidence',0.45,'min_sample',3,
     'accion','Dedicar 60% de práctica a chipping y approach. Menos driver, más wedges.')),
  ('three_putt_frequency', 'Frecuencia de three-putts', 'aggregate', 'seed',
   jsonb_build_object('metric_key','three_putts_per_round','min_confidence',0.5,'min_sample',3,
     'accion','Práctica de lag putting — distancia antes que dirección. Objetivo: 0 three-putts.'))
ON CONFLICT (pattern_key) DO NOTHING;
