-- validate_score_delta: claves de hoyo canónicas y golpes enteros (escrita el 17-oct-2026).
--
-- Renumerada al 27-oct: el baseline del esquema es 20261019200001 y el canario
-- src/__tests__/canary-migration-names.test.ts prohíbe migraciones anteriores a él (correrían antes
-- del baseline al construir una base desde estos archivos, sobre tablas que todavía no existen).
--
-- `ronda_libre_jugadores.scores` y `ronda_equipos.scores` son jsonb sin ningún CHECK: esta función es su única
-- validación, y la llaman los dos RPC de anotación (upsert_ronda_libre_scores / upsert_ronda_equipos_scores),
-- que anon puede ejecutar para las tarjetas sin cuenta. La versión del 01-oct dejaba pasar dos cosas:
--
-- 1. Claves no canónicas. `k::int` acepta '01', ' 1', '+1' y '1 ': cada una pasa como hoyo 1 pero queda guardada
--    como una clave DISTINTA de '1'. Los lectores convierten con Number(k)/parseInt(k) (tarjeta-historica.ts,
--    ronda-libre-scorer.ts, share-card.ts, round-highlights.ts…): según el orden de las claves, '01' pisa el
--    golpe real del hoyo 1 en el historial que alimenta el índice.
-- 2. Golpes con decimales. `(v#>>'{}')::int` redondea 4.5 a 5 para el chequeo de rango, pero el delta se guarda
--    tal cual: queda 4.5 en la tarjeta. Y un número enorme (1e10) reventaba el ::int con un error genérico en vez
--    de INVALID_DELTA.
--
-- Prod medido el 27-oct (consulta de lectura): 0 claves no canónicas y 0 decimales en 3.783 golpes de
-- ronda_libre_jugadores.scores + ronda_equipos.scores → la regla nueva no deja inválida ninguna tarjeta
-- existente. Los clientes mandan String(n) y enteros (toJsonbDelta en src/lib/data/ronda-libre-scores.ts).
-- Se conserva todo lo demás: -1 = CONCEDE del match play, rango 1..20, hoyos 1..27, ERRCODE P0004.
-- El 1..20 es a propósito el borde de la BD, no el del scorer: la fuente única de lo que el jugador
-- puede anotar es GOLPES_MIN_POR_HOYO/GOLPES_MAX_POR_HOYO (1..15) en src/golf/ronda-libre/golpes-por-hoyo.ts,
-- y la BD deja margen por encima para no invalidar tarjetas del torneo (score/page.tsx acepta hasta 20).
-- Canario: src/__tests__/prod/validate-score-delta.canary.test.ts. Rollback: rollback/20261027_validate_score_delta_canonico_rollback.sql

CREATE OR REPLACE FUNCTION public.validate_score_delta(p_delta jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  k text;
  v jsonb;
  hole_num int;
  score_num numeric;
BEGIN
  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_delta)
  LOOP
    -- Sólo la forma canónica: sin ceros a la izquierda, signos ni espacios.
    IF k !~ '^[1-9][0-9]?$' THEN
      RAISE EXCEPTION 'INVALID_DELTA: clave "%" no es un número de hoyo válido', k
        USING ERRCODE = 'P0004';
    END IF;
    hole_num := k::int;

    IF hole_num > 27 THEN
      RAISE EXCEPTION 'INVALID_DELTA: hoyo % fuera de rango 1-27', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    IF jsonb_typeof(v) <> 'number' THEN
      RAISE EXCEPTION 'INVALID_DELTA: score del hoyo % no es un número', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    score_num := (v#>>'{}')::numeric;
    IF score_num <> trunc(score_num) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % no es un número entero de golpes', score_num, hole_num
        USING ERRCODE = 'P0004';
    END IF;

    -- -1 = CONCEDE (src/golf/formats/match-play.ts): el "Conceder hoyo" del
    -- match play se guarda así. Rechazarlo hacía fallar el guardado de TODA la
    -- tarjeta (el delta va en lote). Espejo: CONCEDE en match-play.ts.
    IF score_num <> -1 AND (score_num < 1 OR score_num > 20) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % fuera de rango 1-20', score_num, hole_num
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;
END;
$function$;

-- Privilegios: los mismos que tiene hoy en prod (proacl medido el 17-oct: PUBLIC, anon, authenticated y
-- service_role con EXECUTE). CREATE OR REPLACE los conserva; se declaran para que quede escrito quién la usa
-- (canary-privado-por-defecto). La llaman los RPC SECURITY DEFINER de anotación; es pura y no lee tablas.
GRANT EXECUTE ON FUNCTION public.validate_score_delta(jsonb) TO anon, authenticated, service_role;
