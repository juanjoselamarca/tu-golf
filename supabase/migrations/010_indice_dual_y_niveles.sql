-- ============================================================
-- Golfers+ · Migración 010: Índice Dual + Sistema de Niveles
-- 30 marzo 2026
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Segura de re-ejecutar — IF NOT EXISTS en todo
-- ============================================================

-- ============================================================
-- BLOQUE 1: historical_rounds — slope/rating/diferencial
-- slope_rating y course_rating ya pueden existir (import las usa).
-- diferencial es nuevo.
-- ============================================================

ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS slope_rating   INTEGER,
  ADD COLUMN IF NOT EXISTS course_rating  DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS diferencial    DECIMAL(5,2);

COMMENT ON COLUMN historical_rounds.slope_rating IS
  'Slope rating de los tees usados. Copiado de courses.slope_rating al jugar.';
COMMENT ON COLUMN historical_rounds.course_rating IS
  'Course rating de los tees usados. Copiado de courses.course_rating al jugar.';
COMMENT ON COLUMN historical_rounds.diferencial IS
  'Diferencial USGA = (total_gross - course_rating) * 113 / slope_rating.';

-- ============================================================
-- BLOQUE 2: profiles — Índice Golfers+ calculado
-- profiles.indice = índice Federación (ya existe, NO tocar)
-- profiles.indice_golfers = índice calculado por la app (nuevo)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS indice_golfers            DECIMAL(4,1),
  ADD COLUMN IF NOT EXISTS indice_golfers_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.indice IS
  'Índice oficial Federación de Golf de Chile. Lo actualiza el usuario manualmente.';
COMMENT ON COLUMN profiles.indice_golfers IS
  'Índice calculado por Golfers+. Fórmula USGA: mejores N diferenciales de las últimas 20 rondas × 0.96. Mínimo 3 rondas con slope/rating para activarse.';

-- ============================================================
-- BLOQUE 3: profiles — Sistema de niveles
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nivel            INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nivel_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nivel_expires_at TIMESTAMPTZ;

-- Inicializar nivel=1 para usuarios existentes que queden con NULL
UPDATE profiles SET nivel = 1 WHERE nivel IS NULL;

COMMENT ON COLUMN profiles.nivel IS
  '1=Rookie · 2=En Cancha · 3=Jugador Activo · 4=Scratch+ · 5=Golfer+. Basado en rondas de los últimos 90 días.';
COMMENT ON COLUMN profiles.nivel_expires_at IS
  'El nivel baja si no se juega en 60 días.';

-- ============================================================
-- BLOQUE 4: Índices de rendimiento
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_historical_rounds_diferencial
  ON historical_rounds(user_id, diferencial ASC)
  WHERE diferencial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_nivel
  ON profiles(nivel);

CREATE INDEX IF NOT EXISTS idx_historical_rounds_con_diferencial
  ON historical_rounds(user_id, played_at DESC)
  WHERE slope_rating IS NOT NULL AND course_rating IS NOT NULL;

-- ============================================================
-- BLOQUE 5: Función RPC para calcular Índice Golfers+
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_indice_golfers(p_user_id UUID)
RETURNS DECIMAL(4,1)
LANGUAGE plpgsql
AS $$
DECLARE
  v_diferenciales  DECIMAL[];
  v_count          INTEGER;
  v_usar           INTEGER;
  v_promedio       DECIMAL(5,2);
  v_indice         DECIMAL(4,1);
BEGIN
  SELECT ARRAY_AGG(diferencial ORDER BY diferencial ASC)
  INTO   v_diferenciales
  FROM (
    SELECT diferencial
    FROM   historical_rounds
    WHERE  user_id      = p_user_id
      AND  diferencial  IS NOT NULL
      AND  slope_rating IS NOT NULL
      AND  course_rating IS NOT NULL
    ORDER  BY played_at DESC
    LIMIT  20
  ) sub;

  v_count := COALESCE(ARRAY_LENGTH(v_diferenciales, 1), 0);

  IF v_count < 3 THEN
    RETURN NULL;
  END IF;

  -- Tabla USGA: cuántos diferenciales usar
  v_usar := CASE
    WHEN v_count <= 6  THEN 1
    WHEN v_count <= 8  THEN 2
    WHEN v_count <= 11 THEN 3
    WHEN v_count <= 14 THEN 4
    WHEN v_count <= 16 THEN 5
    WHEN v_count = 17  THEN 6
    WHEN v_count <= 19 THEN 7
    ELSE 8
  END;

  SELECT AVG(d)
  INTO   v_promedio
  FROM   UNNEST(v_diferenciales[1:v_usar]) AS d;

  v_indice := ROUND(v_promedio * 0.96, 1);

  UPDATE profiles
  SET    indice_golfers            = v_indice,
         indice_golfers_updated_at = NOW()
  WHERE  id = p_user_id;

  RETURN v_indice;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'calcular_indice_golfers: error para user_id=% → %', p_user_id, SQLERRM;
  RETURN NULL;
END;
$$;

-- ============================================================
-- BLOQUE 6: Backfill — calcular diferencial para rondas existentes
-- que ya tienen slope_rating y course_rating (importadas de Garmin)
-- ============================================================

UPDATE historical_rounds
SET diferencial = ROUND(((total_gross - course_rating) * 113.0 / slope_rating)::numeric, 2)
WHERE slope_rating IS NOT NULL
  AND course_rating IS NOT NULL
  AND diferencial IS NULL
  AND total_gross IS NOT NULL
  AND slope_rating > 0;

-- Recalcular índice Golfers+ para todos los usuarios con 3+ diferenciales
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM historical_rounds
    WHERE diferencial IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) >= 3
  LOOP
    PERFORM calcular_indice_golfers(r.user_id);
  END LOOP;
END;
$$;

-- ============================================================
-- VERIFICACIÓN — ejecutar después para confirmar
-- ============================================================
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name IN ('profiles', 'historical_rounds')
--   AND  column_name IN (
--     'indice_golfers', 'indice_golfers_updated_at',
--     'nivel', 'nivel_updated_at', 'nivel_expires_at',
--     'slope_rating', 'course_rating', 'diferencial'
--   )
-- ORDER BY table_name, column_name;
