/**
 * src/golf/ronda-libre/match-de-la-ronda.ts
 *
 * FUENTE ÚNICA del match play de una ronda libre. Lo calculaban por su lado el
 * scorer (`useMatchPlayState`), la vista en vivo/resultados (`buildMatchResult`)
 * y el guardado en el historial (`extrasDeTarjeta`), con tres diferencias que
 * podían dar ganadores distintos para la misma ronda:
 *   - las dos vistas descartaban los hoyos concedidos (filtro `v > 0`);
 *   - el historial repartía golpes con `jugador.handicap` (el índice declarado)
 *     y no con el course handicap de scoring;
 *   - el historial leía los hoyos de la cancha sin `hoyosDeLaVuelta`.
 * Ahora los tres llaman a esta función con los mismos insumos: hoyos de la ronda
 * (par + SI) y el course handicap de scoring de cada jugador.
 */

import { calcularMatchPlay, hoyosSinTerminarDelMatch, scoresParaMatch, type MatchResult } from '@/golf/formats/match-play'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { RondaLibre } from '@/types/ronda'

type Golpes = Record<string | number, number | null | undefined>

export interface HoyoDelMatch {
  numero: number
  par: number
  stroke_index: number
}

/**
 * Match de los dos jugadores de la ronda, con `perspectivaId` como jugador A (por
 * defecto el primero). `null` si la ronda no es match play, no tiene 2 jugadores,
 * no hay hoyos de cancha o `perspectivaId` no es uno de los dos.
 */
export function matchDeLaRonda(input: {
  ronda: Pick<RondaLibre, 'formato_juego' | 'holes' | 'modo_juego' | 'hoyo_inicio'> & {
    ronda_libre_jugadores: ReadonlyArray<{ id: string; nombre: string }>
  }
  /** Golpes por jugador (id → hoyo → golpes), crudos: se filtran con `scoresParaMatch`. */
  scoresPorJugador: Record<string, Golpes | null | undefined>
  hoyos: readonly HoyoDelMatch[]
  /** Course handicap de SCORING por jugador (`courseHandicapsDeRonda`). */
  courseHcpPorJugador: Record<string, number | null | undefined>
  perspectivaId?: string
}): MatchResult | null {
  const { ronda, scoresPorJugador, hoyos, courseHcpPorJugador, perspectivaId } = input
  if (ronda.formato_juego !== 'match_play') return null
  const [j0, j1] = ronda.ronda_libre_jugadores
  if (!j0 || !j1 || hoyos.length === 0) return null
  if (perspectivaId != null && perspectivaId !== j0.id && perspectivaId !== j1.id) return null
  const [a, b] = perspectivaId === j1.id ? [j1, j0] : [j0, j1]

  return calcularMatchPlay(
    scoresParaMatch(scoresPorJugador[a.id]),
    scoresParaMatch(scoresPorJugador[b.id]),
    [...hoyos],
    {
      courseHandicapA: courseHcpPorJugador[a.id] ?? 0,
      courseHandicapB: courseHcpPorJugador[b.id] ?? 0,
      totalHoles: ronda.holes,
      modo: ronda.modo_juego === 'gross' ? 'gross' : 'neto',
      hoyos: hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes),
    },
    { nombreA: a.nombre, nombreB: b.nombre },
  )
}

/**
 * Hoyos que un jugador de la ronda no tiene que anotar: en match play, los que su
 * rival le concedió y los posteriores a decidirse el match. `match` debe venir de
 * `matchDeLaRonda` SIN perspectiva (A = primer jugador). Fuera de match play o si
 * el jugador no es uno de los dos, ninguno. Lo usan los finalizadores para no
 * rellenarlos con par y para saber si la tarjeta está completa.
 */
export function hoyosSinTerminarDeJugador(
  match: MatchResult | null,
  jugadores: ReadonlyArray<{ id: string }>,
  jugadorId: string,
): number[] {
  if (!match) return []
  const perspectiva = jugadores[0]?.id === jugadorId ? 'a' : jugadores[1]?.id === jugadorId ? 'b' : null
  return perspectiva ? hoyosSinTerminarDelMatch(match, perspectiva) : []
}
