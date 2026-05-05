-- Auditar Hurlingham completo + constraints
WITH
  hur_courses AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'nombre', nombre, 'tipo', tipo_recorrido, 'par', par_total,
      'activa', activa, 'fuente', fuente
    ) ORDER BY nombre), '[]'::jsonb) AS d
    FROM courses WHERE nombre ILIKE '%hurlingham%'
  ),
  hur_tees AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'nombre', t.nombre, 'genero', t.genero,
      'course_id', t.course_id, 'course_nombre', c.nombre,
      'rating', t.rating, 'slope', t.slope, 'yardaje', t.yardaje_total
    ) ORDER BY c.nombre, t.nombre), '[]'::jsonb) AS d
    FROM course_tees t JOIN courses c ON c.id = t.course_id
    WHERE c.nombre ILIKE '%hurlingham%'
  ),
  unique_constraints AS (
    SELECT jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid))) AS d
    FROM pg_constraint
    WHERE conrelid = 'public.course_tees'::regclass
      AND contype IN ('u','c')
  )
SELECT jsonb_pretty(jsonb_build_object(
  'hurlingham_courses', (SELECT d FROM hur_courses),
  'hurlingham_tees',    (SELECT d FROM hur_tees),
  'tees_constraints',   (SELECT d FROM unique_constraints)
)) AS data;
