-- HOTFIX P0 (01-oct-2026). `validate_score_delta` llegó a prod a las 05:26 desde la
-- rama sin mergear del PR #468 (20261001b) y rechazaba todo score fuera de 1..20.
-- El "Conceder hoyo" del match play guarda -1 (CONCEDE en src/golf/formats/match-play.ts):
-- el RPC rechazaba el delta y, como el delta va en lote, fallaba el guardado de TODA
-- la tarjeta del jugador. Se acepta -1; 0, negativos y > 20 siguen rechazados.

CREATE OR REPLACE FUNCTION public.validate_score_delta(p_delta jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  k text;
  v jsonb;
  hole_num int;
  score_val int;
BEGIN
  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_delta)
  LOOP
    BEGIN
      hole_num := k::int;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_DELTA: clave "%" no es un número de hoyo válido', k
        USING ERRCODE = 'P0004';
    END;

    IF hole_num < 1 OR hole_num > 27 THEN
      RAISE EXCEPTION 'INVALID_DELTA: hoyo % fuera de rango 1-27', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    IF jsonb_typeof(v) <> 'number' THEN
      RAISE EXCEPTION 'INVALID_DELTA: score del hoyo % no es un número', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    score_val := (v#>>'{}')::int;
    -- -1 = CONCEDE (src/golf/formats/match-play.ts). Espejo: si cambia allá, cambia acá.
    IF score_val <> -1 AND (score_val < 1 OR score_val > 20) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % fuera de rango 1-20', score_val, hole_num
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;
END;
$function$;
