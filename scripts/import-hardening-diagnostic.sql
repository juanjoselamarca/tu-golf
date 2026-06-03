-- READ-ONLY diagnostic for import-hardening brainstorm. No writes.

-- 1. Duplicate course clusters: same normalized base name across rows
SELECT
  lower(regexp_replace(unaccent(nombre), '\s*\((damas|varones|caballeros)\)\s*', '', 'gi')) AS base_norm,
  count(*) AS filas,
  count(DISTINCT fuente) AS fuentes,
  array_agg(DISTINCT fuente) AS fuente_list,
  array_agg(id) AS course_ids,
  array_agg(nombre) AS nombres
FROM courses
WHERE COALESCE(activa, true) = true
GROUP BY 1
HAVING count(*) > 1
ORDER BY filas DESC
LIMIT 40;

-- 2. historical_rounds: CR/slope completeness + diferencial sanity
SELECT
  count(*) AS total_rounds,
  count(*) FILTER (WHERE slope_rating IS NOT NULL) AS con_slope,
  count(*) FILTER (WHERE course_rating IS NOT NULL) AS con_cr,
  count(*) FILTER (WHERE diferencial IS NOT NULL) AS con_diferencial,
  count(*) FILTER (WHERE course_id IS NULL) AS sin_course_id,
  count(*) FILTER (WHERE diferencial < -5) AS dif_imposible_bajo,
  count(*) FILTER (WHERE diferencial > 54) AS dif_imposible_alto,
  count(*) FILTER (WHERE holes_played = 9) AS rondas_9h,
  count(*) FILTER (WHERE holes_played = 9 AND course_rating > 60) AS rondas_9h_cr_18h_scale,
  count(DISTINCT user_id) AS usuarios
FROM historical_rounds;

-- 3. Corrupt-diferencial rounds grouped by user + source
SELECT
  user_id,
  import_source,
  holes_played,
  count(*) AS n,
  min(diferencial) AS dif_min,
  max(diferencial) AS dif_max,
  array_agg(DISTINCT round(course_rating::numeric,1)) FILTER (WHERE course_rating IS NOT NULL) AS crs,
  array_agg(DISTINCT slope_rating) FILTER (WHERE slope_rating IS NOT NULL) AS slopes
FROM historical_rounds
WHERE diferencial IS NOT NULL AND (diferencial < -5 OR diferencial > 54)
GROUP BY user_id, import_source, holes_played
ORDER BY n DESC
LIMIT 30;

-- 4. course_tees coverage: how many courses have real tee ratings
SELECT
  count(DISTINCT c.id) AS courses_total,
  count(DISTINCT ct.course_id) AS courses_con_tees
FROM courses c
LEFT JOIN course_tees ct ON ct.course_id = c.id
WHERE COALESCE(c.activa, true) = true;
