-- Verificar estado actual: historical_rounds + scores + indice
SELECT jsonb_pretty(jsonb_build_object(
  'jugador_scores_actual', (
    SELECT scores FROM ronda_libre_jugadores
    WHERE id = '8b7a7652-ab74-49bd-9496-9515c8cadf2d'
  ),
  'historical_rounds_30abr', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'total_gross', total_gross, 'holes_played', holes_played,
      'diferencial', diferencial, 'scores', scores,
      'slope_rating', slope_rating, 'course_rating', course_rating,
      'created_at', created_at
    ))
    FROM historical_rounds
    WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND played_at = '2026-04-30'
  ),
  'profile', (
    SELECT jsonb_build_object(
      'indice_golfers', indice_golfers, 'nivel', nivel,
      'indice', indice, 'updated_at', updated_at
    )
    FROM profiles WHERE id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
  ),
  'historical_columns', (
    SELECT jsonb_agg(column_name ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='historical_rounds'
  )
)) AS data;
