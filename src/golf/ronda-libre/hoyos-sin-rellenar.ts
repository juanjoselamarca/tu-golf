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
 *   es "no jugó" y quien no anotó lo pierde; un par inventado le regalaría el hoyo. El hoyo en pantalla se
 *   rellena (es el par gris que el anotador está viendo, igual que "Siguiente": bug del 30-abr) SOLO si alguien
 *   que sigue jugando ya lo anotó (`hoyoEnPantallaQueSeRellenaEnLaTimba`); si nadie lo tocó, no se jugó.
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
  /** Scores de todos los jugadores. En una Timba deciden si el hoyo en pantalla se jugó; sin ellos, no se rellena. */
  scores?: Readonly<Record<string, ScoresDeTarjeta | undefined>>
}): number[] {
  const { matchResult, jugadores, jugadorId, retiros, ordenHoyos, esTimba, hoyoEnPantalla, scores } = input
  const retiro = hoyosNoJugadosPorRetiro(retiros?.[jugadorId], ordenHoyos)
  if (esTimba) {
    const seRellena = hoyoEnPantalla == null ? undefined
      : hoyoEnPantallaQueSeRellenaEnLaTimba({ jugadores, scores: scores ?? {}, retiros, ordenHoyos, hoyoEnPantalla })
    return ordenHoyos.filter(h => h !== seRellena || retiro.includes(h))
  }
  const match = hoyosSinTerminarDeJugador(matchResult, jugadores, jugadorId)
  if (retiro.length === 0) return match
  return ordenHoyos.filter(h => match.includes(h) || retiro.includes(h))
}

/**
 * ¿La tarjeta de `jugadorId` ya no espera golpes en `hoyo`? Anotada, o el jugador se retiró en ese hoyo o antes (Timba
 * libre). Fuente única del ✓ de la fila de hoyos y del hoyo en que se retoma el scorer: sin el retiro, los hoyos del
 * retirado quedaban "por anotar" para siempre y el scorer reabría en el hoyo del retiro (QA 17-nov, ronda 8722R3).
 */
export function tarjetaAlDiaEnHoyo(
  scores: ScoresDeTarjeta | undefined,
  jugadorId: string,
  hoyo: number,
  retiros: Readonly<Record<string, number>> | null | undefined,
  ordenHoyos: readonly number[],
): boolean {
  return scoreDelHoyo(scores ?? {}, hoyo) !== undefined || estaRetiradoEn(retiros?.[jugadorId], hoyo, ordenHoyos)
}

interface HoyoEnPantallaDeLaTimba {
  jugadores: ReadonlyArray<{ id: string }>
  scores: Readonly<Record<string, ScoresDeTarjeta | undefined>>
  retiros?: Readonly<Record<string, number>>
  ordenHoyos: readonly number[]
  hoyoEnPantalla: number
}

/**
 * Timba libre al cerrar: el hoyo en pantalla, si se jugó (algún jugador que no se retiró antes ya tiene score en
 * él) y por eso se rellena con par para quien falte; `undefined` si nadie lo anotó (ej.: jugaron 9 y "Siguiente"
 * dejó el scorer en el 10): entonces cuenta como no jugado, igual que los demás.
 */
export function hoyoEnPantallaQueSeRellenaEnLaTimba(input: HoyoEnPantallaDeLaTimba): number | undefined {
  const { jugadores, scores, retiros, ordenHoyos, hoyoEnPantalla } = input
  if (!ordenHoyos.includes(hoyoEnPantalla)) return undefined
  const alguienLoAnoto = jugadores.some(j =>
    !estaRetiradoEn(retiros?.[j.id], hoyoEnPantalla, ordenHoyos) && scoreDelHoyo(scores[j.id] ?? {}, hoyoEnPantalla) !== undefined,
  )
  return alguienLoAnoto ? hoyoEnPantalla : undefined
}

/**
 * Timba libre: hoyos que al cerrar quedan "no jugados" para alguien (fuera del hoyo en pantalla cuando se
 * rellena con par): alguno de los que seguían jugando no lo anotó. Los hoyos de un retirado no cuentan (ya no
 * juega). En orden de juego. Es lo que avisa la hoja de Finalizar.
 */
export function hoyosQueQuedanSinJugarEnLaTimba(input: HoyoEnPantallaDeLaTimba): number[] {
  const { jugadores, scores, retiros, ordenHoyos } = input
  const seRellena = hoyoEnPantallaQueSeRellenaEnLaTimba(input)
  return ordenHoyos.filter(h => h !== seRellena && jugadores.some(j =>
    !estaRetiradoEn(retiros?.[j.id], h, ordenHoyos) && scoreDelHoyo(scores[j.id] ?? {}, h) === undefined,
  ))
}
