-- 024_tee_por_jugador.sql
-- Tee (color de salida) por jugador, para cálculo preciso del HCP de cancha
-- y diferencial WHS. Cada jugador puede salir de un tee distinto en la misma
-- ronda (hombres blancas, mujeres rojas, seniors amarillas, etc).

ALTER TABLE ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS tees TEXT;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS tees TEXT;

-- Backfill desde la ronda/torneo cuando el jugador no tenía tee propio
UPDATE ronda_libre_jugadores rlj
SET tees = rl.tees
FROM rondas_libres rl
WHERE rlj.ronda_id = rl.id
  AND rlj.tees IS NULL
  AND rl.tees IS NOT NULL;

UPDATE players p
SET tees = t.tees
FROM tournaments t
WHERE p.tournament_id = t.id
  AND p.tees IS NULL
  AND t.tees IS NOT NULL;
