import type { MatchResult } from '@/golf/formats/match-play'
import { estaRetiradoEn, hoyosNoJugadosPorRetiro } from '@/golf/formats/personalizado/retiro'
import { hoyosSinTerminarDeJugador } from './match-de-la-ronda'
import { scoreDelHoyo, type ScoresDeTarjeta } from './tarjeta-historica'
import { estaFueraDelHoyo, hoyosConX, type HoyosFuera } from '@/golf/formats/skins/fuera-del-hoyo'

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
 * - Skins: los hoyos con X («Fuera del hoyo»). La X es un valor anotado, no un hueco: un par ahí inventaría golpes.
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
  /** Skins: hoyos con X de ESTE jugador. */
  fuera?: HoyosFuera
}): number[] {
  const { matchResult, jugadores, jugadorId, retiros, ordenHoyos, esTimba, hoyoEnPantalla, scores, fuera } = input
  // Hoyos de ESTE jugador que no esperan golpes: desde su retiro (Timba) y los que marcó con X (skins).
  const propios = [...hoyosNoJugadosPorRetiro(retiros?.[jugadorId], ordenHoyos), ...hoyosConX(fuera, ordenHoyos)]
  if (esTimba) {
    const seRellena = hoyoEnPantalla == null ? undefined
      : hoyoEnPantallaQueSeRellenaEnLaTimba({ jugadores, scores: scores ?? {}, retiros, ordenHoyos, hoyoEnPantalla })
    return ordenHoyos.filter(h => h !== seRellena || propios.includes(h))
  }
  const match = hoyosSinTerminarDeJugador(matchResult, jugadores, jugadorId)
  if (propios.length === 0) return match
  return ordenHoyos.filter(h => match.includes(h) || propios.includes(h))
}

/**
 * ¿La tarjeta de `jugadorId` ya no espera golpes en `hoyo`? Anotada, o el jugador se retiró en ese hoyo o antes (Timba
 * libre). Fuente única del ✓ de la fila de hoyos, del hoyo en que se retoma el scorer, de a quién rellena con par
 * "Siguiente" y de los hoyos que la hoja de Finalizar avisa como no jugados: sin el retiro, los hoyos del
 * retirado quedaban "por anotar" para siempre y el scorer reabría en el hoyo del retiro (QA 17-nov, ronda 8722R3).
 * Skins: un hoyo con X está anotado (`fuera`, los hoyos con X de este jugador).
 */
export function tarjetaAlDiaEnHoyo(
  scores: ScoresDeTarjeta | undefined,
  jugadorId: string,
  hoyo: number,
  retiros: Readonly<Record<string, number>> | null | undefined,
  ordenHoyos: readonly number[],
  fuera?: HoyosFuera,
): boolean {
  return scoreDelHoyo(scores ?? {}, hoyo) !== undefined || estaFueraDelHoyo(fuera, hoyo) || estaRetiradoEn(retiros?.[jugadorId], hoyo, ordenHoyos)
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
    !tarjetaAlDiaEnHoyo(scores[j.id], j.id, h, retiros, ordenHoyos),
  ))
}

/**
 * Timba libre al cerrar: de `hoyosQueQuedanSinJugarEnLaTimba`, los que NADIE de los que seguían jugando anotó. El motor
 * no los puntúa ("sin_jugar": nadie gana ni pierde); en los demás, quien no anotó pierde contra quien sí. La hoja
 * de Finalizar los avisa distinto (decisión de Juanjo, 17-nov).
 */
export function hoyosQueNadieJugoEnLaTimba(input: HoyoEnPantallaDeLaTimba): number[] {
  const { jugadores, scores, retiros, ordenHoyos } = input
  return hoyosQueQuedanSinJugarEnLaTimba(input).filter(h => !jugadores.some(j =>
    !estaRetiradoEn(retiros?.[j.id], h, ordenHoyos) && scoreDelHoyo(scores[j.id] ?? {}, h) !== undefined,
  ))
}
