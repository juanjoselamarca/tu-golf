-- Migration: historical_rounds.excluded_from_handicap + filter en calcular_indice_golfers
--
-- Motivación: inbox e21e2a32 (parte B). El usuario pide poder excluir tarjetas del
-- cálculo del índice — caso típico: rondas de torneos en formato no-individual
-- (scramble de 4, best ball, etc.) que NO reflejan su rendimiento personal.
-- Garmin ofrece esto en cada tarjeta. Replica del comportamiento.

BEGIN;

ALTER TABLE historical_rounds
ADD COLUMN IF NOT EXISTS excluded_from_handicap BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN historical_rounds.excluded_from_handicap IS
  'Si TRUE, esta ronda NO entra al cálculo del índice Golfers+ (toggle del usuario en /perfil/historial). Inbox e21e2a32.';

-- Reemplazar RPC para excluir rondas marcadas. Mantiene el resto de la lógica
-- de la migration 037 (9h + 18h, mejores N de 20, factor 0.96).
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
    WHERE  user_id               = p_user_id
      AND  diferencial           IS NOT NULL
      AND  slope_rating          IS NOT NULL
      AND  course_rating         IS NOT NULL
      AND  excluded_from_handicap = FALSE  -- inbox e21e2a32 parte B
    ORDER  BY played_at DESC
    LIMIT  20
  ) sub;

  v_count := COALESCE(ARRAY_LENGTH(v_diferenciales, 1), 0);

  IF v_count < 3 THEN
    UPDATE profiles
    SET    indice_golfers            = NULL,
           indice_golfers_updated_at = NOW()
    WHERE  id = p_user_id;
    RETURN NULL;
  END IF;

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

COMMIT;
