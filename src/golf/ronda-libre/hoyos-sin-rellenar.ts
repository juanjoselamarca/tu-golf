import type { MatchResult } from '@/golf/formats/match-play'
import { hoyosNoJugadosPorRetiro } from '@/golf/formats/personalizado/retiro'
import { hoyosSinTerminarDeJugador } from './match-de-la-ronda'

/**
 * Hoyos de un jugador que NO se rellenan con par al cerrar ni al pasar de hoyo. Fuente única para el scorer de
 * grupo (aviso "se marcan como par", `goToNextHole` y el cierre):
 * - match play: los hoyos que el match ya no jugó (terminó antes, 4&3);
 * - Timba libre: los hoyos desde que el jugador se retiró. Rellenarlos con par le daría hoyos jugados que no jugó
 *   (el motor cuenta como jugado todo hoyo con score).
 */
export function hoyosQueNoSeRellenan(input: {
  matchResult: MatchResult | null
  jugadores: ReadonlyArray<{ id: string }>
  jugadorId: string
  /** `VistaDelJuego.retiros` (jugadorId → hoyo desde el que se retiró); vacío fuera de una Timba. */
  retiros?: Readonly<Record<string, number>>
  ordenHoyos: readonly number[]
}): number[] {
  const { matchResult, jugadores, jugadorId, retiros, ordenHoyos } = input
  const match = hoyosSinTerminarDeJugador(matchResult, jugadores, jugadorId)
  const retiro = hoyosNoJugadosPorRetiro(retiros?.[jugadorId], ordenHoyos)
  if (retiro.length === 0) return match
  return ordenHoyos.filter(h => match.includes(h) || retiro.includes(h))
}
