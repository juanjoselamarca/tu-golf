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

export interface RankedOutput {
  /** Players ordenados (sort + countback aplicado), listos para render. */
  players: Player[]
  /** order[i] = índice del entry original (input `entries`) cuyo Player
   *  quedó en la posición final i. Necesario para mapear datos del entry
   *  (todayVsPar, dbPlayerId) al orden FINAL — el `sortFor` previo solo
   *  da el orden pre-countback. */
  order: number[]
}

/** Score vs par del entry según el modo de ranking. Es el número que
 *  termina en Player.total (la columna SCORE del leaderboard).
 *  La referencia es `e.parPlayed` — el par de los hoyos REALMENTE jugados —
 *  para que un jugador a mitad de vuelta no aparezca líder bajo par por el
 *  solo hecho de haber jugado poco. Sin `parPlayed` (entries viejos) cae al
 *  par de la vuelta completa × rondas. */
function vsParFor(e: LeaderboardEntry, mode: RankingMode, parTotal: number): number {
  if (mode === 'stableford') return e.stablefordTotal
  if (e.holesPlayed === 0) return 0
  const total = mode === 'gross' ? e.grossTotal : e.netTotal
  const rp = e.roundsPlayed ?? 1
  const reference = e.parPlayed ?? parTotal * Math.max(1, rp)
  return total - reference
}

/** Sentinela de "sin datos": ordena al final sin romper la aritmética del
 *  countback (un Infinity sí la rompería). */
const NO_DATA_SORT = 9999

/**
 * Valor por el que se ORDENA (y por el que el countback detecta empates).
 *
 * En gross/neto es el score VS PAR, no el total de golpes crudos: a mitad de
 * vuelta el total crudo premia al que menos jugó, y el board ponía primero al
 * que llevaba 3 hoyos por encima del que había terminado bajo par. Los
 * jugadores sin datos van al final, nunca al medio.
 *
 * lower-is-better en gross/neto, higher-is-better en stableford (el countback
 * recibe la dirección vía `cbMode`).
 */
function primaryScoreFor(e: LeaderboardEntry, mode: RankingMode, parTotal: number): number {
  if (mode === 'stableford') {
    // En stableford gana el más alto, así que "sin datos" es el más bajo
    // posible. Devolver 0 lo empataría con un doble bogey real y el countback
    // le colgaría un "(empate)" a alguien que no jugó.
    return e.holesPlayed === 0 ? -NO_DATA_SORT : e.stablefordTotal
  }
  if (e.holesPlayed === 0) return NO_DATA_SORT
  return vsParFor(e, mode, parTotal)
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
 * aplicado para el modo elegido, junto con el `order` final (índice de cada
 * entry original en la posición resultante). Cero side-effects.
 *
 * Bug corregido vs versión previa:
 * - cbMode depende del `mode` (de la VISTA), no del `formatoJuego` del
 *   torneo. Antes: torneo stableford con tab gross usaba higher_wins → en
 *   empate elegía al jugador con MÁS strokes (bug). Ahora: gross → lower,
 *   neto → lower, stableford-points → higher.
 * - Devuelve `order` final para que el caller pueda mapear datos del entry
 *   (todayVsPar, dbPlayerId) al orden POST-countback, no al pre-sort.
 */
export function rankEntries(
  entries: LeaderboardEntry[],
  mode: RankingMode,
  opts: RankEntriesOptions,
): RankedOutput {
  if (entries.length === 0) return { players: [], order: [] }

  const { parTotal } = opts
  const nameOf = opts.nameOf ?? ((e) => e.name)

  // Sort por el modo elegido. stableford siempre higher-wins.
  // Llevamos también el índice original del entry para que el countback
  // pueda devolver el orden final POST-tiebreak con el dato preservado.
  const indexed = entries.map((e, i) => ({ entry: e, originalIndex: i }))
  const sorted = [...indexed].sort((a, b) => {
    const av = primaryScoreFor(a.entry, mode, parTotal)
    const bv = primaryScoreFor(b.entry, mode, parTotal)
    // stableford: más alto primero. gross/neto ("a par"): más bajo primero.
    return mode === 'stableford' ? bv - av : av - bv
  })

  // Countback: dirección la decide el MODO de la vista, no el formato del
  // torneo. stableford-points → higher_wins. gross/neto → lower_wins.
  const cbMode: CountbackMode = mode === 'stableford' ? 'higher_wins' : 'lower_wins'

  // El countback usa puntos stableford solo cuando el modo de la vista es
  // 'stableford'. Para gross/neto siempre usa strokes brutos.
  const cbPlayers: CountbackPlayer[] = sorted.map((s, idx) => ({
    id: String(idx),
    name: nameOf(s.entry, idx),
    scores: mode === 'stableford'
      ? (s.entry.stablefordScores ?? s.entry.scores.map((v) => v ?? 0))
      : s.entry.scores.map((v) => v ?? 0),
    primaryScore: primaryScoreFor(s.entry, mode, parTotal),
  }))

  // holeCount = nº de hoyos de la ronda (9 o 18). Los builders rellenan `scores`
  // a `totalHoyos` con nulls, así que su largo es el nº de hoyos aunque haya
  // hoyos sin jugar. Necesario para que el countback de 9h use back-6/3/1 en vez
  // de caer al card-off desde el hoyo 1 (mismo motor hole-count-aware que equipos).
  const holeCount = entries.reduce((mx, e) => Math.max(mx, e.scores.length), 0) || 18
  const cbResults = resolveLeaderboardTies(cbPlayers, cbMode, holeCount)

  const players: Player[] = []
  const order: number[] = []
  cbResults.forEach((r, idx) => {
    const sortedIdx = parseInt(r.id)
    const { entry: e, originalIndex } = sorted[sortedIdx]
    const vsPar = vsParFor(e, mode, parTotal)
    const annotatedName = r.annotation ? `${nameOf(e, idx)} ${r.annotation}` : nameOf(e, idx)
    players.push({
      pos:     idx + 1,
      id:      e.id,
      name:    annotatedName,
      country: 'CL',
      cat:     e.cat ?? 'General',
      hcp:     e.handicap,
      hcpDisplay: e.hcpDisplay ?? e.handicap,
      today:   vsPar,
      total:   vsPar,
      holes:   e.holesPlayed,
      grossTotal: e.grossTotal,
      netTotal: e.netTotal,
      stablefordTotal: e.stablefordTotal,
      status:  e.status,
      scores:  e.scores,
    })
    order.push(originalIndex)
  })

  return { players, order }
}
