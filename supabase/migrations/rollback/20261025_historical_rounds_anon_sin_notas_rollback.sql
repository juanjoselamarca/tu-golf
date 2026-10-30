-- Rollback de 20261025000000_historical_rounds_anon_sin_notas.sql.
-- Devuelve a anon el SELECT sobre la tabla entera: las notas de las rondas compartidas vuelven a leerse
-- sin cuenta con la anon key. Correr sólo si la tarjeta pública se rompió por una columna que falta en
-- el GRANT (mejor: agregar esa columna al GRANT).
-- Correrlo deja en rojo a canary-anon-table-privileges y a canary-anon-columns (ANON_TABLE_PRIVILEGES ya no
-- declara historical_rounds): es esperado mientras dure la emergencia, se arregla al re-aplicar la migración.

REVOKE SELECT (
  id, user_id, privacy, course_name, course_id, total_gross, holes_played, played_at, tee_color,
  scores, par_per_hole, formato_juego, modo_juego
) ON TABLE public.historical_rounds FROM anon;

GRANT SELECT ON TABLE public.historical_rounds TO anon;
