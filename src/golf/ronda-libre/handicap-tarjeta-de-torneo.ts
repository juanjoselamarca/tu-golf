/**
 * src/golf/ronda-libre/handicap-tarjeta-de-torneo.ts
 *
 * Qué hándicap lleva la fila de un inscrito en la tarjeta del grupo de un torneo
 * (`ronda_libre_jugadores.handicap` + `handicap_de_inscripcion`). FUENTE ÚNICA: la usa
 * el inicio del torneo (`materializeGroupScorecard`) y la usará la edición del hándicap
 * inscrito ya iniciado (PR C del plan 2026-11-16-torneo-hcp-sin-indice).
 *
 * El scorer y el board leen `handicap` SIEMPRE como índice. La marca
 * `handicap_de_inscripcion` dice "este número lo gobierna la inscripción": lo separa del
 * índice que tipea el creador de una ronda libre, para que la privacidad
 * (`handicapOcultoSinSesion`) y la fuente (`indiceVieneDelPerfil`) no se confundan.
 */
import { esModoHcpWhs, handicapInscrito, type InscritoConIndice } from '@/golf/core/compute-player-course-hcp'

/** Lo que la tarjeta necesita del inscrito (`players` + su perfil). `StartPlayer` lo cumple. */
export interface InscritoParaTarjeta extends InscritoConIndice {
  user_id: string | null
}

/** Columnas de hándicap de la fila de la tarjeta. `{}` = no se escriben (el índice sale del perfil). */
export type FilaDeHandicapDeTorneo =
  | { handicap: number | null; handicap_de_inscripcion: true }
  | Record<string, never>

/**
 * Handicap (índice) del inscrito tal como lo puntúa el torneo.
 *  - WHS: lo inscrito (`handicapInscrito`; 0 si no tiene), el mismo número con que
 *    puntúan el handicap de equipo y el Resumen y el que ve el organizador.
 *  - raw (torneos viejos): lo inscrito es un course handicap ya convertido; escribirlo
 *    en un campo de índice lo convertiría dos veces. Se mantiene el índice del perfil.
 */
export function handicapDeLaTarjeta(player: InscritoConIndice, hcpCalcMode: string | null | undefined): number {
  if (esModoHcpWhs(hcpCalcMode)) return handicapInscrito(player)
  return player.profiles?.indice ?? player.handicap_at_registration ?? 0
}

/**
 * La fila de hándicap del inscrito en la tarjeta del grupo.
 *  - WHS: SIEMPRE lo inscrito con la marca, tenga o no cuenta (antes un jugador con
 *    cuenta en modo individual tomaba el índice VIVO del perfil: si FedeGolf lo movía en
 *    plena ronda, la tarjeta y el board puntuaban con números distintos). Sin índice
 *    inscrito va `null`: la tarjeta lo muestra sin índice ("S/Ind") y juega con 0, en vez
 *    de un "0" que parece un scratch.
 *  - raw: equipo o invitado → `handicapDeLaTarjeta` con la marca; individual con cuenta →
 *    nada (el índice sale del perfil, como siempre: lo inscrito en raw es un course
 *    handicap y la tarjeta espera un índice).
 */
export function filaDeHandicapDeTorneo(
  player: InscritoParaTarjeta,
  hcpCalcMode: string | null | undefined,
  teamFormat: boolean,
): FilaDeHandicapDeTorneo {
  if (esModoHcpWhs(hcpCalcMode)) {
    return { handicap: player.handicap_at_registration ?? null, handicap_de_inscripcion: true }
  }
  if (teamFormat || !player.user_id) {
    return { handicap: handicapDeLaTarjeta(player, hcpCalcMode), handicap_de_inscripcion: true }
  }
  return {}
}
