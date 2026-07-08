-- Cupo máximo de jugadores del torneo.
-- El wizard ya recogía `registration.max_players` pero se perdía al publicar
-- (nunca se insertaba en `tournaments`) y la inscripción no tenía tope → la
-- inscripción #25 con cupo 24 entraba igual. Persistimos la columna; joinFlow
-- (registerPlayerAndRound) la valida al inscribir. NULL = sin tope (default).
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_players INTEGER;

COMMENT ON COLUMN tournaments.max_players IS
  'Cupo máximo de jugadores inscritos (aprobados). NULL = sin tope. Validado en joinFlow.registerPlayerAndRound.';
