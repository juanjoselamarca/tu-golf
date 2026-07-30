// src/golf/leaderboard/player-name.ts
//
// FUENTE ÚNICA del nombre visible de un jugador en un board.
//
// El barrido del 27-jul encontró AL MISMO jugador con cuatro nombres distintos
// según la vista ("Jugador", "Sin nombre", el nombre del perfil, el nombre de
// inscripción). Causa: cada board encadenaba sus candidatos con `??`, que sólo
// cubre null/undefined — un `player_name` guardado como cadena vacía pasaba el
// filtro y renderizaba una celda en blanco, y cada vista elegía otro fallback.

/** Lo que se muestra cuando no hay NINGÚN nombre utilizable. */
export const UNNAMED_PLAYER = 'Jugador'

/**
 * Primer candidato con contenido real, ya trimmeado.
 *
 * Usa contenido, no `??`: la cadena vacía y los espacios cuentan como "no hay
 * nombre" y caen al siguiente candidato. El orden de los argumentos es la
 * prioridad — típicamente `(profiles?.name, player_name)`: el perfil manda
 * porque el jugador lo puede corregir, el de inscripción lo tipeó el organizador.
 */
export function resolvePlayerName(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }
  return UNNAMED_PLAYER
}
