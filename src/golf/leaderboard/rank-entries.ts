// src/golf/leaderboard/rank-entries.ts
//
// Convierte LeaderboardEntry[] en Player[] ordenados por un criterio
// específico (gross / neto / stableford-points) con countback aplicado.
//
// Se usa en los dos builders (ronda libre y legacy) para producir los
// rankings paralelos que alimentan el toggle Gross/Neto del leaderboard.
// El countback es INDEPENDIENTE por modo: dos jugadores empatados en
// gross pueden romperse al revés que en neto, y está bien — son tablas
// distintas.

import { resolveLeaderboardTies } from '@/golf/core/countback'
import type { CountbackMode, CountbackPlayer } from '@/golf/core/countback'
import type { FormatoJuego } from '@/golf/core/rules'
import type { Player } from '@/lib/golf-data'
import type { LeaderboardEntry } from './types'

export type RankingMode = 'gross' | 'neto' | 'stableford'

/** Score vs par del entry según el modo de ranking. Es el número que
 *  termina en Player.total (la columna SCORE del leaderboard).
 *  En ronda libre `holesPlayed < totalHoyos` se compara contra par parcial
 *  (eso lo resuelve el builder antes de llegar acá vía `e.vsPar`); pero
 *  para los rankings forzados gross/neto reconstruimos vsPar desde totales
 *  con parTotal * roundsPlayed (mismo cálculo que el código legacy). */
function vsParFor(e: LeaderboardEntry, mode: RankingMode, parTotal: number): number {
  if (mode === 'stableford') return e.stablefordTotal
  if (e.holesPlayed === 0) return 0
  const total = mode === 'gross' ? e.grossTotal : e.netTotal
  const rp = e.roundsPlayed ?? 1
  return total - parTotal * Math.max(1, rp)
}

/** primaryScore para countback: lower-is-better en gross/neto, higher-is-better en stableford. */
function primaryScoreFor(e: LeaderboardEntry, mode: RankingMode): number {
  if (mode === 'stableford') return e.stablefordTotal
  return mode === 'gross' ? (e.grossTotal || 999) : (e.netTotal || 999)
}

export interface RankEntriesOptions {
  /** parTotal de la(s) ronda(s). Solo se usa para calcular vsPar en gross/neto. */
  parTotal: number
  /** Formato del torneo (gobierna el modo del countback). */
  formatoJuego: FormatoJuego
  /** Función para extraer el nombre. Permite que un mismo `entries` produzca varios
   *  rankings con nombres "Juan (gross)" / "Juan (neto)" si hiciera falta. Por defecto, e.name. */
  nameOf?: (e: LeaderboardEntry, index: number) => string
}

/**
 * Toma una lista de entries crudos y produce Player[] ordenado + countback
 * aplicado para el modo elegido. Cero side-effects.
 */
export function rankEntries(
  entries: LeaderboardEntry[],
  mode: RankingMode,
  opts: RankEntriesOptions,
): Player[] {
  if (entries.length === 0) return []

  const { parTotal, formatoJuego } = opts
  const nameOf = opts.nameOf ?? ((e) => e.name)

  // Sort por el modo elegido. stableford siempre higher-wins.
  const sorted = [...entries].sort((a, b) => {
    if (mode === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
    const aVal = mode === 'gross' ? (a.grossTotal || 999) : (a.netTotal || 999)
    const bVal = mode === 'gross' ? (b.grossTotal || 999) : (b.netTotal || 999)
    return aVal - bVal
  })

  // Countback: stableford → higher_wins, resto → lower_wins.
  const cbMode: CountbackMode = mode === 'stableford' || formatoJuego === 'stableford'
    ? 'higher_wins'
    : 'lower_wins'

  const cbPlayers: CountbackPlayer[] = sorted.map((e, idx) => ({
    id: String(idx),
    name: nameOf(e, idx),
    scores: mode === 'stableford' || formatoJuego === 'stableford'
      ? (e.stablefordScores ?? e.scores.map((s) => s ?? 0))
      : e.scores.map((s) => s ?? 0),
    primaryScore: primaryScoreFor(e, mode),
  }))

  const cbResults = resolveLeaderboardTies(cbPlayers, cbMode)

  return cbResults.map((r, idx): Player => {
    const e = sorted[parseInt(r.id)]
    const vsPar = vsParFor(e, mode, parTotal)
    const annotatedName = r.annotation ? `${nameOf(e, idx)} ${r.annotation}` : nameOf(e, idx)
    return {
      pos:     idx + 1,
      name:    annotatedName,
      country: 'CL',
      cat:     e.cat ?? 'General',
      hcp:     e.handicap,
      today:   vsPar,
      total:   vsPar,
      holes:   e.holesPlayed,
      status:  e.status,
      scores:  e.scores,
    }
  })
}
