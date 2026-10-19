/**
 * Totales de un equipo de BOLA COMPARTIDA (scramble / foursome) con el mismo motor
 * que el leaderboard (`calcularScramble` / `calcularFoursome`). Es lo que muestra la
 * tarjeta del equipo en el scorer: así el neto en cancha es el del board, también en
 * 9 hoyos (el motor reparte la mitad del handicap de equipo, que está en escala 18h).
 *
 * Usa el handicap de equipo ALMACENADO (`ronda_equipos.handicap_equipo`), el mismo
 * override que aplica el board de torneo (`team-standings`).
 */

import { calcularScramble } from './scramble'
import { calcularFoursome } from './foursome'

export interface TotalesBolaCompartida {
  totalGross: number
  totalNeto: number
  overUnderGross: number
  overUnderNeto: number
  holesPlayed: number
}

export function totalesBolaCompartida(
  formato: 'scramble' | 'foursome',
  equipo: { id: string; nombre: string; scores: Record<string, number>; handicap_equipo: number | null },
  /** Los hoyos que se juegan en la ronda (no la cancha completa). */
  holes: ReadonlyArray<{ numero: number; par: number; stroke_index: number }>,
): TotalesBolaCompartida {
  const hs = [...holes]
  const parTotal = hs.reduce((s, h) => s + h.par, 0)
  const teamHandicap = equipo.handicap_equipo ?? undefined
  const r = formato === 'scramble'
    ? calcularScramble({ id: equipo.id, nombre: equipo.nombre, handicaps: [], scores: equipo.scores, teamHandicap }, hs, parTotal)
    : calcularFoursome({
        id: equipo.id, nombre: equipo.nombre, handicapA: 0, handicapB: 0, nombreA: '', nombreB: '',
        scores: equipo.scores, teamHandicap,
      }, hs, parTotal)
  return {
    totalGross: r.totalGross,
    totalNeto: r.totalNeto,
    overUnderGross: r.overUnderGross,
    overUnderNeto: r.overUnderNeto,
    holesPlayed: r.holesPlayed,
  }
}
