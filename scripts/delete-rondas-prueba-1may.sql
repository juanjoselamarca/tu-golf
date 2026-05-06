-- Borrar las 2 rondas de prueba del 1-may-2026 confirmadas por Juanjo
-- (codigos 1A5722 y 3Q3H41 — ambas con co-jugador invitado sin cuenta).
-- El user_id de Cristián Ross es null en ambas → no se pierde historial ajeno.

BEGIN;

-- 1. historical_rounds de Juanjo asociados al 1-may en Los Leones
DELETE FROM historical_rounds
WHERE id IN ('03df7830-c12e-4aff-adbe-680be3a29537', '605f2c98-f1c8-4b20-9f02-b963e70acac5');

-- 2. jugadores de las 2 rondas
DELETE FROM ronda_libre_jugadores
WHERE ronda_id IN ('19093d0e-0622-4e81-a234-0a28fd4ad799', '266d2966-97da-4347-9847-d4a919d32178');

-- 3. las rondas mismas
DELETE FROM rondas_libres
WHERE id IN ('19093d0e-0622-4e81-a234-0a28fd4ad799', '266d2966-97da-4347-9847-d4a919d32178');

-- 4. recalcular indice por consistencia (no debería cambiar — esas rondas tenían diferencial=null)
SELECT calcular_indice_golfers('98c5cb7a-1c0b-4a64-a773-8bd013a92317'::uuid) AS indice_post;

COMMIT;

-- Verificación
SELECT jsonb_pretty(jsonb_build_object(
  'rondas_residuales_1may', (
    SELECT jsonb_agg(jsonb_build_object('codigo', codigo, 'fecha', fecha))
    FROM rondas_libres
    WHERE creador_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND fecha = '2026-05-01'
  ),
  'historical_residuales_1may', (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'gross', total_gross, 'holes', holes_played))
    FROM historical_rounds
    WHERE user_id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
      AND played_at = '2026-05-01'
  ),
  'indice_actual', (
    SELECT jsonb_build_object('indice_golfers', indice_golfers, 'updated_at', indice_golfers_updated_at)
    FROM profiles WHERE id = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
  )
)) AS verificacion;
