import { loadScores } from '@/lib/ronda/score-storage'

/**
 * Golpes de los jugadores anotados EN ESTE teléfono, para que el leaderboard del
 * scorer los muestre al instante por encima de lo que trae el servidor.
 *
 * "Anotado aquí" = tiene respaldo local no vacío (cada cambio de golpe se guarda
 * en localStorage antes de enviarse). Sirve igual cuando un teléfono anota por
 * varios jugadores (selector / pestañas). Los jugadores de OTROS teléfonos no
 * entran: su copia en memoria es la del montaje y los congelaría.
 * El valor es el estado en memoria (lo más nuevo), no el respaldo.
 */
export function scoresAnotadosEnEsteTelefono(
  codigo: string,
  jugadorIds: readonly string[],
  scores: Record<string, Record<number, number>>,
): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {}
  for (const id of jugadorIds) {
    if (Object.keys(loadScores(codigo, id)).length > 0) out[id] = scores[id] ?? loadScores(codigo, id)
  }
  return out
}
