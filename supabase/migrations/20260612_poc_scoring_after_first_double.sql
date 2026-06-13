-- 20260612_poc_scoring_after_first_double.sql
-- PoC chunk 3: patrón declarativo gen-1 sin código.
-- El motor lo computa vía interpretObserver(formula_payload.recipe).
-- Status 'validating': acumula evidencia sin entrar al ranking del foco.

INSERT INTO pattern_definitions (
  pattern_key, name, description, generation, formula_kind, source, status,
  weight, formula_payload
) VALUES (
  'scoring_after_first_double',
  'Caída post-double',
  'Promedio de score en los hoyos posteriores al primer double-bogey o peor. Mide la capacidad de recuperación mental tras un desastre.',
  1,
  'intra_round',
  'admin',
  'validating',
  0.4,
  jsonb_build_object(
    'metric_key', 'post_double_score_avg',
    'accion', 'Después del primer double, haz un reset completo: camina despacio al siguiente tee, respira 4 veces, y comprométete a un plan conservador.',
    'min_confidence', 0.5,
    'min_sample', 3,
    'recipe', jsonb_build_object(
      'type', 'hole_filter_agg',
      'filter', jsonb_build_object('field', 'over_par', 'op', 'gte', 'value', 2),
      'scope', 'after_first',
      'compute', jsonb_build_object('metric', 'score', 'aggregate', 'avg'),
      'min_holes', 2
    )
  )
) ON CONFLICT (pattern_key) DO NOTHING;

-- Sync peso al paramétrico vivo.
INSERT INTO cerebro_weights (parameter_type, parameter_key, current_weight, source)
SELECT 'pattern', 'scoring_after_first_double', 0.4, 'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM cerebro_weights
  WHERE parameter_type = 'pattern'
    AND parameter_key = 'scoring_after_first_double'
    AND user_cluster_id IS NULL
);
