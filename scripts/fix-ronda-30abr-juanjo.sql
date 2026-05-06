-- Reparar la ronda 30-abr-2026 de Juanjo en Los Leones
-- Bug: hoyo 9 (par 5) no se persistió porque el último hoyo en par no
-- dispara auto-fill. Score real reportado por Juanjo: 5 (par).
-- Ronda: 566RV4 (id d2560c00-231d-49c5-bf2b-a3d6790ad021)
-- Jugador Juanjo: 8b7a7652-ab74-49bd-9496-9515c8cadf2d

BEGIN;

-- 1. Agregar score=5 al hoyo 9 en el JSON
UPDATE ronda_libre_jugadores
SET scores = scores || jsonb_build_object('9', 5)
WHERE id = '8b7a7652-ab74-49bd-9496-9515c8cadf2d'
  AND (scores->>'9') IS NULL;  -- idempotente: solo si falta

-- 2. Borrar historical_rounds que se creó con datos incompletos (8 hoyos)
--    para que la siguiente inserción genere uno correcto con 9 hoyos.
DELETE FROM historical_rounds
WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
  AND played_at = '2026-04-30'
  AND course_name ILIKE '%leones%'
  AND holes_played = 8;  -- solo el roto, no toques otros si ya hay

-- 3. Re-insertar historical_rounds con datos completos
--    Replicar la lógica de finalizeRound pero idempotente.
DO $$
DECLARE
  v_jugador RECORD;
  v_ronda RECORD;
  v_scores_array INT[];
  v_total_gross INT;
  v_holes_played INT := 9;
  v_tee TEXT := 'azul';
  v_slope INT;
  v_cr NUMERIC;
  v_front_cr NUMERIC;
  v_front_slope INT;
  v_diferencial NUMERIC;
BEGIN
  SELECT * INTO v_jugador FROM ronda_libre_jugadores
    WHERE id = '8b7a7652-ab74-49bd-9496-9515c8cadf2d';

  SELECT * INTO v_ronda FROM rondas_libres
    WHERE id = 'd2560c00-231d-49c5-bf2b-a3d6790ad021';

  v_total_gross := (v_jugador.scores->>'1')::int + (v_jugador.scores->>'2')::int
                 + (v_jugador.scores->>'3')::int + (v_jugador.scores->>'4')::int
                 + (v_jugador.scores->>'5')::int + (v_jugador.scores->>'6')::int
                 + (v_jugador.scores->>'7')::int + (v_jugador.scores->>'8')::int
                 + (v_jugador.scores->>'9')::int;

  v_scores_array := ARRAY[
    (v_jugador.scores->>'1')::int, (v_jugador.scores->>'2')::int, (v_jugador.scores->>'3')::int,
    (v_jugador.scores->>'4')::int, (v_jugador.scores->>'5')::int, (v_jugador.scores->>'6')::int,
    (v_jugador.scores->>'7')::int, (v_jugador.scores->>'8')::int, (v_jugador.scores->>'9')::int
  ];

  -- Tee data: Los Leones, azul
  SELECT rating, slope, front_course_rating, front_slope_rating
    INTO v_cr, v_slope, v_front_cr, v_front_slope
  FROM course_tees
  WHERE course_id = v_ronda.course_id AND nombre ILIKE 'azul%' LIMIT 1;

  -- Diferencial WHS 9h (jugó front 9 → usa front_course_rating + front_slope_rating)
  -- Fórmula: (113 / slope) * (gross - cr)
  IF v_front_cr IS NOT NULL AND v_front_slope IS NOT NULL THEN
    v_diferencial := ROUND(((113.0 / v_front_slope) * (v_total_gross - v_front_cr))::numeric, 1);
  ELSIF v_cr IS NOT NULL AND v_slope IS NOT NULL THEN
    -- Fallback con rating 18h dividido por 2 si no hay front_*
    v_diferencial := ROUND(((113.0 / v_slope) * (v_total_gross - (v_cr / 2)))::numeric, 1);
  END IF;

  INSERT INTO historical_rounds (
    user_id, course_name, course_id, played_at, total_gross, scores, holes_played,
    tee_color, privacy, slope_rating, course_rating, diferencial,
    formato_juego, modo_juego
  ) VALUES (
    '98c5cb7a-1c0b-4a64-a773-8bd013a92317',
    v_ronda.course_name,
    v_ronda.course_id,
    v_ronda.fecha,
    v_total_gross,
    to_jsonb(v_scores_array),
    v_holes_played,
    v_tee,
    'private',
    COALESCE(v_front_slope, v_slope),
    COALESCE(v_front_cr, v_cr / 2),
    v_diferencial,
    v_ronda.formato_juego,
    v_ronda.modo_juego
  );

  RAISE NOTICE 'Reinsertado historical_rounds: gross=%, holes=%, dif=%', v_total_gross, v_holes_played, v_diferencial;
END $$;

-- 4. Recalcular indice y nivel del usuario
SELECT calcular_indice_golfers('98c5cb7a-1c0b-4a64-a773-8bd013a92317'::uuid);

COMMIT;

-- Verificación
SELECT jsonb_pretty(jsonb_build_object(
  'jugador_scores', (
    SELECT scores FROM ronda_libre_jugadores
    WHERE id = '8b7a7652-ab74-49bd-9496-9515c8cadf2d'
  ),
  'historical', (
    SELECT jsonb_build_object(
      'total_gross', total_gross, 'holes_played', holes_played,
      'diferencial', diferencial, 'scores', scores
    )
    FROM historical_rounds
    WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND played_at = '2026-04-30'
    ORDER BY id DESC LIMIT 1
  ),
  'indice', (
    SELECT jsonb_build_object('indice', indice, 'indice_golfers', indice_golfers, 'nivel', nivel)
    FROM profiles WHERE id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
  )
)) AS verificacion;
