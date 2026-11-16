import type { MatchResult } from '@/golf/formats/match-play'
import { estaRetiradoEn, hoyosNoJugadosPorRetiro } from '@/golf/formats/personalizado/retiro'
import { hoyosSinTerminarDeJugador } from './match-de-la-ronda'
import { scoreDelHoyo, type ScoresDeTarjeta } from './tarjeta-historica'

/**
 * Hoyos de un jugador que NO se rellenan con par al cerrar ni al pasar de hoyo. Fuente única para el scorer de
 * grupo (aviso "se marcan como par", `goToNextHole` y el cierre):
 * - match play: los hoyos que el match ya no jugó (terminó antes, 4&3);
 * - Timba libre: los hoyos desde que el jugador se retiró. Rellenarlos con par le daría hoyos jugados que no jugó
 *   (el motor cuenta como jugado todo hoyo con score);
 * - Timba libre al cerrar: TODOS menos el hoyo en pantalla. Regla de Juanjo (26-oct): un hoyo sin score al cerrar
 *   es "no jugó" y quien no anotó lo pierde; un par inventado le regalaría el hoyo. El hoyo en pantalla sí se
 *   rellena (es el par gris que el anotador está viendo, igual que "Siguiente": bug del 30-abr).
 */
export function hoyosQueNoSeRellenan(input: {
  matchResult: MatchResult | null
  jugadores: ReadonlyArray<{ id: string }>
  jugadorId: string
  /** `VistaDelJuego.retiros` (jugadorId → hoyo desde el que se retiró); vacío fuera de una Timba. */
  retiros?: Readonly<Record<string, number>>
  ordenHoyos: readonly number[]
  /** Timba libre: solo se rellena `hoyoEnPantalla` (si el jugador no se retiró antes). */
  esTimba?: boolean
  /** Hoyo que muestra el scorer al cerrar. Sin él (o fuera de la ronda), en una Timba no se rellena ninguno. */
  hoyoEnPantalla?: number
}): number[] {
  const { matchResult, jugadores, jugadorId, retiros, ordenHoyos, esTimba, hoyoEnPantalla } = input
  const retiro = hoyosNoJugadosPorRetiro(retiros?.[jugadorId], ordenHoyos)
  if (esTimba) return ordenHoyos.filter(h => h !== hoyoEnPantalla || retiro.includes(h))
  const match = hoyosSinTerminarDeJugador(matchResult, jugadores, jugadorId)
  if (retiro.length === 0) return match
  return ordenHoyos.filter(h => match.includes(h) || retiro.includes(h))
}

/**
 * Timba libre: hoyos que al cerrar quedan "no jugados" para alguien (fuera del hoyo en pantalla, que se rellena
 * con par): alguno de los que seguían jugando no lo anotó. Los hoyos de un retirado no cuentan (ya no juega).
 * En orden de juego. Es lo que avisa la hoja de Finalizar.
 */
export function hoyosQueQuedanSinJugarEnLaTimba(input: {
  jugadores: ReadonlyArray<{ id: string }>
  scores: Readonly<Record<string, ScoresDeTarjeta | undefined>>
  retiros?: Readonly<Record<string, number>>
  ordenHoyos: readonly number[]
  hoyoEnPantalla: number
}): number[] {
  const { jugadores, scores, retiros, ordenHoyos, hoyoEnPantalla } = input
  return ordenHoyos.filter(h => h !== hoyoEnPantalla && jugadores.some(j =>
    !estaRetiradoEn(retiros?.[j.id], h, ordenHoyos) && scoreDelHoyo(scores[j.id] ?? {}, h) === undefined,
  ))
}
