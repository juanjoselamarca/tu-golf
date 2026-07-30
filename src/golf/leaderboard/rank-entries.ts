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
 *
 *  Se compara SIEMPRE contra `e.parPlayed` — el par de los hoyos jugados, que
 *  ya viene acumulado entre rondas. Antes se reconstruía como
 *  `parTotal * roundsPlayed` (par de la cancha completa): un jugador en par
 *  thru 9 salía "−36" y el board quedaba al revés durante toda la ronda,
 *  liderado por el que menos hoyos llevaba. Ver `individual-score.ts`. */
function vsParFor(e: LeaderboardEntry, mode: RankingMode): number {
  if (mode === 'stableford') return e.stablefordTotal
  if (e.holesPlayed === 0) return 0
  const total = mode === 'gross' ? e.grossTotal : e.netTotal
  return total - e.parPlayed
}

/**
 * Métrica que ORDENA y que agrupa empates para el countback. Es la MISMA que se
 * muestra (`vsParFor`) — antes ordenaba por golpes crudos mientras mostraba vs
 * par, así que mid-ronda el board quedaba ordenado al revés: con todos en par,
 * el que iba thru 3 sumaba 12 golpes y le "ganaba" al que iba thru 15 con 60.
 * Terminado el torneo (todos thru 18) ambas métricas ordenan igual.
 */
function rankValueFor(e: LeaderboardEntry, mode: RankingMode): number {
  return vsParFor(e, mode)
}

/** Mayor que cualquier `holesPlayed` posible (18 × rondas). */
const STAGE_WEIGHT = 1000

/**
 * Clave de agrupación del countback: mismo vs par Y mismo avance.
 *
 * El countback compara tarjetas hoyo a hoyo, así que sólo tiene sentido entre
 * jugadores en la misma etapa de la ronda. Empaquetar `holesPlayed` en la clave
 * evita que el desempate reordene a dos jugadores que empatan en vs par pero
 * van por hoyos distintos — ese caso ya lo resolvió el sort (gana el más
 * avanzado) y el countback no debe deshacerlo.
 */
function countbackScoreFor(e: LeaderboardEntry, mode: RankingMode): number {
  const value = rankValueFor(e, mode) * STAGE_WEIGHT
  // lower_wins (gross/neto) → restar hoyos; higher_wins (stableford) → sumarlos.
  return mode === 'stableford' ? value + e.holesPlayed : value - e.holesPlayed
}

export interface RankEntriesOptions {
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

  const nameOf = opts.nameOf ?? ((e) => e.name)

  // Los que no empezaron NO compiten: un jugador sin hoyos cargados está en
  // "—", no en "E", y no puede ocupar el podio por delante de quien sí jugó.
  // Van al fondo, en el orden en que llegaron, sin countback.
  const indexed = entries.map((e, i) => ({ entry: e, originalIndex: i }))
  const conDatos = indexed.filter((x) => x.entry.holesPlayed > 0)
  const sinDatos = indexed.filter((x) => x.entry.holesPlayed === 0)

  // Sort por la métrica de la vista. stableford siempre higher-wins.
  // Llevamos también el índice original del entry para que el countback
  // pueda devolver el orden final POST-tiebreak con el dato preservado.
  const sorted = [...conDatos].sort((a, b) => {
    const aVal = rankValueFor(a.entry, mode)
    const bVal = rankValueFor(b.entry, mode)
    if (aVal !== bVal) return mode === 'stableford' ? bVal - aVal : aVal - bVal
    // Mismo vs par con distinto avance: primero el que lleva más hoyos. Sostener
    // el par en 15 hoyos vale más que sostenerlo en 3.
    return b.entry.holesPlayed - a.entry.holesPlayed
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
    primaryScore: countbackScoreFor(s.entry, mode),
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
    const vsPar = vsParFor(e, mode)
    const annotatedName = r.annotation ? `${nameOf(e, idx)} ${r.annotation}` : nameOf(e, idx)
    players.push({
      pos:     idx + 1,
      name:    annotatedName,
      country: 'CL',
      cat:     e.cat ?? 'General',
      hcp:     e.handicap,
      hcpDisplay: e.hcpDisplay ?? e.handicap,
      today:   vsPar,
      total:   vsPar,
      holes:   e.holesPlayed,
      status:  e.status,
      scores:  e.scores,
    })
    order.push(originalIndex)
  })

  // Los que aún no cargaron nada, al fondo: posición correlativa, score en 0
  // (`holes: 0` es la señal para que la UI muestre "—") y sin anotación de
  // countback, que no desempata a quien no jugó.
  sinDatos.forEach(({ entry: e, originalIndex }) => {
    players.push({
      pos:     players.length + 1,
      name:    nameOf(e, players.length),
      country: 'CL',
      cat:     e.cat ?? 'General',
      hcp:     e.handicap,
      hcpDisplay: e.hcpDisplay ?? e.handicap,
      today:   0,
      total:   0,
      holes:   0,
      status:  e.status,
      scores:  e.scores,
    })
    order.push(originalIndex)
  })

  return { players, order }
}
