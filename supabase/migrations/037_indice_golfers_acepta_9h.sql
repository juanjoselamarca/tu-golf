-- Migration 037: calcular_indice_golfers acepta rondas de 9 hoyos
--
-- Bug: la migration 010 puso un filtro `total_gross >= 60` en el SELECT
-- inicial del RPC, asumiendo que era forma de descartar rondas Garmin
-- truncadas/inválidas. Pero excluye TODAS las rondas legítimas de 9 hoyos
-- (gross 9h típicamente entre 36-50, nunca >= 60).
--
-- Resultado: usuarios que juegan rondas 9h (canchas cortas, ejecutivas,
-- vespertinas) tienen sus mejores diferenciales fuera del cálculo del
-- índice → handicap inflado.
--
-- Detectado por Juanjo el 2026-05-06: ronda 30-abr (gross=38, diferencial=0.70)
-- no contaba para su indice_golfers a pesar de ser su mejor ronda del mes.
--
-- Fix: eliminar el filtro `total_gross >= 60`. Los diferenciales 9h en
-- historical_rounds ya están normalizados a escala 18h-equivalente por
-- `calcularDiferencial` (en src/lib/indice-golfers.ts) usando front_course_rating
-- + front_slope_rating cuando holes_played < 18. Como el RPC ya filtra por
-- `diferencial IS NOT NULL`, las rondas 9h con diferencial calculado son
-- válidas WHS y deben entrar.
--
-- El backfill al final de la migration 010 (linea 151) NO se modifica: ese
-- bloque corrió one-time y usa fórmula 18h pura (course_rating completo) que
-- solo es correcta para rondas de 18 hoyos.

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

-- Recalcular indice_golfers para todos los usuarios con diferenciales
-- (incluye usuarios que solo tenían rondas 9h sin contar antes).
DO $$
DECLARE
  r RECORD;
  v_count_recalc INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM   historical_rounds
    WHERE  diferencial IS NOT NULL
  LOOP
    PERFORM calcular_indice_golfers(r.user_id);
    v_count_recalc := v_count_recalc + 1;
  END LOOP;
  RAISE NOTICE 'Recalculados indices para % usuarios', v_count_recalc;
END $$;
