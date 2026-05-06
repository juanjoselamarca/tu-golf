-- Verificar impacto del fix en indice de Juanjo + impacto global
SELECT jsonb_pretty(jsonb_build_object(
  'juanjo_post_fix', (
    SELECT jsonb_build_object(
      'indice_golfers', indice_golfers,
      'indice_golfers_updated_at', indice_golfers_updated_at,
      'nivel', nivel
    )
    FROM profiles WHERE id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
  ),
  'juanjo_diferenciales_que_cuentan_ahora', (
    SELECT jsonb_agg(jsonb_build_object(
      'fecha', played_at, 'gross', total_gross, 'holes', holes_played,
      'diferencial', diferencial
    ) ORDER BY diferencial ASC)
    FROM historical_rounds
    WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND diferencial IS NOT NULL
      AND slope_rating IS NOT NULL
      AND course_rating IS NOT NULL
    LIMIT 20
  ),
  'usuarios_con_indice_que_cambio', (
    SELECT COUNT(*)
    FROM profiles
    WHERE indice_golfers_updated_at >= NOW() - INTERVAL '5 minutes'
  ),
  'rondas_9h_recuperadas_globales', (
    SELECT COUNT(*) FROM historical_rounds
    WHERE diferencial IS NOT NULL AND total_gross < 60
  )
)) AS data;
