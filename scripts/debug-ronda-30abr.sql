-- Pre-flight: ver el panorama de las 2 rondas de prueba antes de borrarlas
SELECT jsonb_pretty(jsonb_build_object(
  'rondas', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'codigo', r.codigo, 'fecha', r.fecha, 'estado', r.estado,
      'jugadores', (
        SELECT jsonb_agg(jsonb_build_object(
          'id', j.id, 'nombre', j.nombre, 'user_id', j.user_id,
          'es_juanjo', j.user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
        ))
        FROM ronda_libre_jugadores j WHERE j.ronda_id = r.id
      )
    ))
    FROM rondas_libres r
    WHERE r.codigo IN ('1A5722', '3Q3H41')
  ),
  'historical_rounds_asociados_juanjo', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'played_at', played_at, 'total_gross', total_gross,
      'holes_played', holes_played, 'diferencial', diferencial,
      'course_name', course_name
    ))
    FROM historical_rounds
    WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND played_at = '2026-05-01'
  )
)) AS preflight;
