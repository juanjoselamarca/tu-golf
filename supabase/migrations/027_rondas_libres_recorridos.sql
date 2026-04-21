-- 027_rondas_libres_recorridos.sql
-- Fix schema drift: rondas_libres.recorridos fue agregada en Supabase dashboard
-- pero nunca trackeada en migrations. Sin esta migración, un setup fresh de BD
-- rompe la creación de rondas multi-recorrido (courseLoops × loops seleccionados).

-- La columna guarda los nombres de recorridos seleccionados para la ronda,
-- ej: ['A', 'B'] para jugar 18 hoyos combinando loop A + loop B de una cancha
-- de 27 hoyos. Si NULL o vacío: ronda usa el recorrido default de la cancha.

ALTER TABLE rondas_libres
  ADD COLUMN IF NOT EXISTS recorridos TEXT[];

COMMENT ON COLUMN rondas_libres.recorridos IS
  'Lista de nombres de recorridos (course_holes.recorrido) a jugar en esta ronda. NULL = recorrido default de la cancha. Usado en canchas multi-loop (27+ hoyos).';
