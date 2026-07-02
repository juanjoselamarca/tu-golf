-- Migration: fix pares Norte-Este (DAMAS) de Las Brisas de Santo Domingo.
--
-- Bug (detectado 27-jun, confirmado 01-jul): la ficha DAMAS de "Norte - Este"
-- tenía el back-9 del loop "Sur" en vez del "Este". El par por hoyo es INVARIANTE
-- al género → debe igualar a su gemela VARONES. par_total daba 72 igual, por eso
-- pasó silencioso, pero rompía el análisis hoyo-a-hoyo del coach para damas.
--
-- Verificado: el back-9 correcto (5,3,4,4,5,4,3,4,4) coincide con el front-9 de
-- "Este - Norte (VARONES)" — el loop Este real.
--
-- Fix idempotente y gender-invariante: deriva de la gemela VARONES. Tolerante a
-- DB sin catálogo FedeGolf (skip silencioso).
DO $$
DECLARE
  v_varones uuid;
  v_damas   uuid;
BEGIN
  SELECT id INTO v_varones FROM courses WHERE nombre = 'C.G. Las Brisas De Santo Domingo - Norte - Este (VARONES)';
  SELECT id INTO v_damas   FROM courses WHERE nombre = 'C.G. Las Brisas De Santo Domingo - Norte - Este (DAMAS)';
  IF v_varones IS NULL OR v_damas IS NULL THEN
    RAISE NOTICE 'Fichas Brisas Norte-Este no presentes — skip.';
    RETURN;
  END IF;

  UPDATE course_holes d
  SET par = v.par
  FROM course_holes v
  WHERE d.course_id = v_damas AND v.course_id = v_varones AND d.numero = v.numero
    AND d.par IS DISTINCT FROM v.par;

  UPDATE courses SET par_total = (SELECT SUM(par) FROM course_holes WHERE course_id = v_damas)
  WHERE id = v_damas;
END $$;
