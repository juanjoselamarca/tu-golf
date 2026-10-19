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
  /** Golpes de handicap que recibe el equipo en cada hoyo de la ronda (sólo cuentan en neto). */
  golpesPorHoyo: Record<number, number>
}

export type HoyoDelMotor = { numero: number; par: number; stroke_index: number }

/**
 * Hoyos de la ronda EN ORDEN DE JUEGO (`hoyosDeLaRonda`) como los recibe el motor de
 * formatos (par 4 y SI = número de hoyo si falta). Fuente única de esos defaults: una
 * ronda de 9 que parte en el 10 lleva los hoyos 10-18, nunca 1-9.
 */
export function hoyosDelMotor(
  ordenHoyos: readonly number[],
  parDe: (hoyo: number) => number | null | undefined,
  siDe: (hoyo: number) => number | null | undefined,
): HoyoDelMotor[] {
  return ordenHoyos.map(h => ({ numero: h, par: parDe(h) ?? 4, stroke_index: siDe(h) ?? h }))
}

/** `hoyosDelMotor` con los mapas del scorer (catálogo por hoyo, con `parMap` de respaldo). */
export function hoyosDeBolaCompartida(
  ordenHoyos: readonly number[],
  parMap: Readonly<Record<number, number>>,
  holeDataMap: Readonly<Record<number, { par?: number; stroke_index?: number | null } | undefined>>,
): HoyoDelMotor[] {
  return hoyosDelMotor(ordenHoyos, h => holeDataMap[h]?.par ?? parMap[h], h => holeDataMap[h]?.stroke_index)
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
    golpesPorHoyo: Object.fromEntries(r.holes.map(h => [h.numero, h.strokesRecibidos])),
  }
}
