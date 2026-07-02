-- Migration: course-matching-v2
-- Arregla el matching de canchas en importación (RPC resolve_and_link_course).
--
-- Bugs que cierra:
--  1. Normalización asimétrica: el RPC v1 sacaba (VARONES/DAMAS) sólo del nombre
--     de ENTRADA, no del catálogo → toda cancha con género bajaba su similitud.
--  2. "C.G." vs "Club de Golf" no colapsaban.
--  3. Puntuación/separadores (~ . - /) no normalizados.
--  4. Sin desambiguación de género → elegía VARONES/DAMAS arbitrario (CR/slope malo).
--  5. Orden del loop (Norte-Este vs Este-Norte) rompía el match.
--
-- Estrategia: una forma CANÓNICA de nombre (tokens significativos, sin género,
-- sin puntuación, ordenados) aplicada a AMBOS lados. Espeja src/golf/courses/course-name.ts.
-- Desambiguación por profiles.genero → courses.genero_norm.

-- ============================================================
-- 1. Tokens significativos (ordenados) + dos formas canónicas.
--    Deben producir lo mismo que significantTokens/canonicalOrdered/
--    normalizeCourseName en src/golf/courses/course-name.ts. Cambiar juntos.
-- ============================================================
CREATE OR REPLACE FUNCTION course_name_tokens(p_name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(tok ORDER BY ord), ARRAY[]::text[])
  FROM (
    SELECT tok, ord
    FROM unnest(
      string_to_array(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(unaccent_immutable(coalesce(p_name, ''))),
              '\y(varones|damas|caballeros)\y', ' ', 'g'  -- quitar género
            ),
            '[^a-z0-9]+', ' ', 'g'                        -- puntuación → espacio
          ),
          '\s+', ' ', 'g'
        ),
        ' '
      )
    ) WITH ORDINALITY AS u(tok, ord)
    WHERE length(tok) > 1
      AND tok NOT IN (
        'club','de','golf','las','los','la','el','del','y',
        'country','campo','and','the','links','course','cg',
        '18','9','hole','holes','hoyos'
      )
  ) t
$$;

-- Forma canónica ORDENADA (sensible al orden del loop): match primario.
CREATE OR REPLACE FUNCTION course_name_canonical_ordered(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT array_to_string(course_name_tokens(p_name), ' ')
$$;

-- Forma canónica ALFABÉTICA (insensible al orden): fallback.
CREATE OR REPLACE FUNCTION course_name_canonical(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT array_to_string(
    ARRAY(SELECT unnest(course_name_tokens(p_name)) ORDER BY 1), ' '
  )
$$;

COMMENT ON FUNCTION course_name_canonical_ordered(text) IS
  'Forma canónica ordenada para matching. Espeja canonicalOrdered() en src/golf/courses/course-name.ts.';
COMMENT ON FUNCTION course_name_canonical(text) IS
  'Forma canónica alfabética (fallback insensible al orden). Espeja normalizeCourseName() en src/golf/courses/course-name.ts.';

-- ============================================================
-- 2. RPC v2 con desambiguación por género + normalización simétrica
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_and_link_course(
  p_course_name text,
  p_par_per_hole jsonb DEFAULT NULL,
  p_similarity_threshold real DEFAULT 0.6,
  p_genero text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canon text;          -- forma ordenada (primario)
  v_canon_sorted text;   -- forma alfabética (fallback)
  v_gender text;   -- 'V' | 'D' | NULL
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
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', null);
  END IF;

  -- Degradación OCR: pares no-enteros ("4.0", "null", "") → ignorar pares (match-only).
  IF p_par_per_hole IS NOT NULL THEN
    SELECT COUNT(*) INTO v_invalid_count
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val)
    WHERE val IS NULL OR val !~ '^\d+$';
    IF v_invalid_count > 0 THEN
      p_par_per_hole := NULL;
    END IF;
  END IF;

  -- Género del jugador → norma del catálogo (V/D). Acepta M/F, masculino/femenino, V/D.
  v_gender := CASE upper(coalesce(p_genero, ''))
    WHEN 'M' THEN 'V' WHEN 'MASCULINO' THEN 'V' WHEN 'V' THEN 'V'
    WHEN 'F' THEN 'D' WHEN 'FEMENINO' THEN 'D' WHEN 'D' THEN 'D'
    ELSE NULL END;

  v_canon := course_name_canonical_ordered(p_course_name);
  v_canon_sorted := course_name_canonical(p_course_name);
  IF v_canon = '' THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', null);
  END IF;

  -- (A0) Match primario: igualdad canónica ORDENADA (respeta orden del loop),
  --      preferir género → oficial → verificada → estable.
  SELECT id, 1.0 INTO v_match_id, v_match_score
  FROM courses
  WHERE course_name_canonical_ordered(nombre) = v_canon
  ORDER BY
    (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
    (fuente = 'fedegolf') DESC,
    (datos_verificados IS TRUE) DESC,
    id
  LIMIT 1;

  -- (A1) Fallback insensible al orden: igualdad canónica ALFABÉTICA. Cubre
  --      convención de nombre distinta cuando el orden exacto no está en catálogo.
  IF v_match_id IS NULL THEN
    SELECT id, 0.95 INTO v_match_id, v_match_score
    FROM courses
    WHERE course_name_canonical(nombre) = v_canon_sorted
    ORDER BY
      (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
      (fuente = 'fedegolf') DESC,
      (datos_verificados IS TRUE) DESC,
      id
    LIMIT 1;
  END IF;

  -- (B) Fallback typos: similitud trigram sobre la forma alfabética.
  IF v_match_id IS NULL THEN
    SELECT id, similarity(course_name_canonical(nombre), v_canon_sorted)
    INTO v_match_id, v_match_score
    FROM courses
    WHERE similarity(course_name_canonical(nombre), v_canon_sorted) >= p_similarity_threshold
    ORDER BY
      similarity(course_name_canonical(nombre), v_canon_sorted) DESC,
      (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
      (fuente = 'fedegolf') DESC,
      id
    LIMIT 1;
  END IF;

  -- Hay match → poblar pares si la ficha estaba vacía, y devolver.
  IF v_match_id IS NOT NULL THEN
    -- Redirigir a la ficha canónica si existe (dedup).
    v_match_id := COALESCE((SELECT canonical_course_id FROM courses WHERE id = v_match_id), v_match_id);

    IF p_par_per_hole IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holes_count FROM course_holes WHERE course_id = v_match_id;
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

    RETURN jsonb_build_object('course_id', v_match_id, 'course_created', false,
                              'holes_populated', v_populated, 'match_score', v_match_score);
  END IF;

  -- Sin match y sin pares → no se crea; la ronda queda con course_name texto.
  IF p_par_per_hole IS NULL THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', v_match_score);
  END IF;

  -- Sin match y CON pares → crear cancha user_added (auto-ingesta).
  SELECT SUM((val)::int) INTO v_par_total
  FROM jsonb_each_text(p_par_per_hole) AS j(k, val);

  BEGIN
    INSERT INTO courses (nombre, par_total, fuente, activa, pais)
    VALUES (p_course_name, v_par_total, 'user_added', true, 'CL')
    RETURNING id INTO v_new_course_id;
    v_created := true;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_new_course_id FROM courses
    WHERE lower(nombre) = lower(p_course_name) AND fuente = 'user_added'
    LIMIT 1;
    IF v_new_course_id IS NULL THEN
      RAISE EXCEPTION 'resolve_and_link_course: race recovery failed for course %', p_course_name;
    END IF;
  END;

  IF v_created THEN
    INSERT INTO course_holes (course_id, numero, par)
    SELECT v_new_course_id, (k::int), (val::int)
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
    v_populated := true;
  END IF;

  RETURN jsonb_build_object('course_id', v_new_course_id, 'course_created', v_created,
                            'holes_populated', v_populated, 'match_score', null);
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_and_link_course(text, jsonb, real, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION course_name_canonical(text) TO authenticated, service_role;
