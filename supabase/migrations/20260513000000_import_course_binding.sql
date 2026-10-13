-- Migration: import-course-binding
-- Date: 2026-05-13
-- Purpose: RPC + indexes para resolver course_id en imports

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Wrapper IMMUTABLE para unaccent (requerido para usarlo en índices).
--    Usa plpgsql en lugar de sql para evitar inlining eagerly.
--    Referencia public.unaccent explícitamente porque la management API
--    ejecuta con search_path restringido.
CREATE OR REPLACE FUNCTION unaccent_immutable(text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE STRICT
AS $$
BEGIN
  RETURN public.unaccent($1);
END;
$$;

-- 3. Índice GIN para fuzzy match rápido sobre nombre normalizado
CREATE INDEX IF NOT EXISTS idx_courses_nombre_trgm
  ON courses USING gin (unaccent_immutable(lower(nombre)) gin_trgm_ops);

-- 4. UNIQUE parcial para evitar duplicados de courses creados por usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_user_added_nombre
  ON courses (lower(nombre))
  WHERE fuente = 'user_added';

-- 5. RPC: resolve_and_link_course
CREATE OR REPLACE FUNCTION resolve_and_link_course(
  p_course_name text,
  p_par_per_hole jsonb DEFAULT NULL,
  p_similarity_threshold real DEFAULT 0.8
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_match_id uuid;
  v_match_score real;
  v_holes_count int;
  v_par_total int;
  v_new_course_id uuid;
  v_created boolean := false;
  v_populated boolean := false;
  v_invalid_count int;
BEGIN
  IF p_course_name IS NULL
     OR trim(p_course_name) = ''
     OR lower(trim(p_course_name)) = 'cancha desconocida' THEN
    RETURN jsonb_build_object(
      'course_id', null,
      'course_created', false,
      'holes_populated', false,
      'match_score', null
    );
  END IF;

  -- C1: Validar que p_par_per_hole solo contenga enteros parseables (keys y values).
  -- OCR puede devolver strings como "4.0", "null" o vacíos; sin esto, los ::int abortarían la transacción.
  -- Estrategia de degradación: si hay valores inválidos, ignoramos los pares y continuamos (match-only).
  IF p_par_per_hole IS NOT NULL THEN
    SELECT COUNT(*) INTO v_invalid_count
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val)
    WHERE k !~ '^[0-9]+$' OR val !~ '^[0-9]+$';

    IF v_invalid_count > 0 THEN
      -- No abortamos: degradamos a "ignorar pares" y seguimos con el flow normal (match-only).
      p_par_per_hole := NULL;
    END IF;
  END IF;

  -- I1: Usar unaccent_immutable() consistentemente (los índices también la usan).
  v_normalized := lower(unaccent_immutable(
    trim(regexp_replace(p_course_name, '\s*\((damas|varones)\)\s*', '', 'gi'))
  ));
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');

  SELECT id, similarity(unaccent_immutable(lower(nombre)), v_normalized)
  INTO v_match_id, v_match_score
  FROM courses
  WHERE similarity(unaccent_immutable(lower(nombre)), v_normalized) > 0.5
  ORDER BY similarity(unaccent_immutable(lower(nombre)), v_normalized) DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL AND v_match_score >= p_similarity_threshold THEN
    IF p_par_per_hole IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holes_count
      FROM course_holes WHERE course_id = v_match_id;

      IF v_holes_count = 0 THEN
        INSERT INTO course_holes (course_id, numero, par)
        SELECT v_match_id, (k::int), (val::int)
        FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
        v_populated := true;

        UPDATE courses
          SET par_total = (SELECT SUM(par) FROM course_holes WHERE course_id = v_match_id)
          WHERE id = v_match_id;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'course_id', v_match_id,
      'course_created', false,
      'holes_populated', v_populated,
      'match_score', v_match_score
    );
  END IF;

  IF p_par_per_hole IS NULL THEN
    RETURN jsonb_build_object(
      'course_id', null,
      'course_created', false,
      'holes_populated', false,
      'match_score', v_match_score
    );
  END IF;

  v_par_total := (SELECT SUM(val::int) FROM jsonb_each_text(p_par_per_hole) AS j(k, val));

  BEGIN
    INSERT INTO courses (nombre, par_total, fuente, activa, pais)
    VALUES (p_course_name, v_par_total, 'user_added', true, 'CL')
    RETURNING id INTO v_new_course_id;
    v_created := true;
  EXCEPTION
    WHEN unique_violation THEN
      -- I2: Null guard tras recovery SELECT — race condition donde la tx competidora hizo rollback.
      SELECT id INTO v_new_course_id FROM courses
      WHERE lower(nombre) = lower(p_course_name) AND fuente = 'user_added'
      LIMIT 1;
      IF v_new_course_id IS NULL THEN
        RAISE EXCEPTION 'resolve_and_link_course: race recovery failed for course %', p_course_name;
      END IF;
      v_created := false;
  END;

  IF v_created THEN
    INSERT INTO course_holes (course_id, numero, par)
    SELECT v_new_course_id, (k::int), (val::int)
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
    v_populated := true;
  END IF;

  RETURN jsonb_build_object(
    'course_id', v_new_course_id,
    'course_created', v_created,
    'holes_populated', v_populated,
    'match_score', null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_and_link_course(text, jsonb, real) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_and_link_course(text, jsonb, real) TO service_role;
