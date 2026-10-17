-- Rollback de 20261017030000_validate_score_delta_canonico.sql: vuelve a la versión del 01-oct
-- (20261001000002_validate_score_delta_permite_concede.sql), copiada de pg_get_functiondef en prod el 17-oct.

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
    -- -1 = CONCEDE (src/golf/formats/match-play.ts): el "Conceder hoyo" del
    -- match play se guarda así. Rechazarlo hacía fallar el guardado de TODA la
    -- tarjeta (el delta va en lote). Espejo: CONCEDE en match-play.ts.
    IF score_val <> -1 AND (score_val < 1 OR score_val > 20) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % fuera de rango 1-20', score_val, hole_num
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;
END;
$function$;
