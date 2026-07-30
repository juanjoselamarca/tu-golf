// src/golf/leaderboard/build-from-legacy.ts
//
// Construye los leaderboards desde el schema legacy `players` + `rounds` +
// `hole_scores`. Multi-round aware. Devuelve TRES rankings paralelos
// (gross, neto, primario por modo del torneo) + inputs GWI + mapping
// playerId→index del ranking primario (para mostrar grupos).

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { computeIndividualScore, sumIndividualScores } from './individual-score'
import { resolvePlayerName } from './player-name'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { Player } from '@/lib/golf-data'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { LeaderboardEntry, TournamentLeaderboardContext } from './types'
import { rankEntries, type RankingMode } from './rank-entries'

export interface LegacyLeaderboardOutput {
  players: Player[]
  playersByGross: Player[]
  playersByNeto: Player[]
  gwiInputs: JugadorGWIInput[]
  /** dbPlayerId → index dentro de `players` (ranking primario). */
  playerIdToIndex: Record<string, number>
}

export function buildLeaderboardFromLegacy(
  dbPlayers: DBPlayer[],
  ctx: TournamentLeaderboardContext,
  tournamentTotalRounds: number,
): LegacyLeaderboardOutput {
  const { totalHoyos, modoJuego, formatoJuego, courseHoles } = ctx
  const playerIdToIndex: Record<string, number> = {}

  if (dbPlayers.length === 0) {
    return {
      players: [],
      playersByGross: [],
      playersByNeto: [],
      gwiInputs: [],
      playerIdToIndex,
    }
  }

  const isMultiRound = tournamentTotalRounds > 1
  const withRounds = dbPlayers.filter((p) => p.rounds?.length > 0)
  const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))
  // SI normalizado a permutación 1..N para alocar golpes (mismo motivo que
  // build-from-ronda-libre: SI 18h-impar en loop de 9h perdía golpes). No-op si
  // el SI ya es permutación válida. No cambia el SI que se MUESTRA.
  const siAlloc = normalizedStrokeIndexByHole(courseHoles, totalHoyos)

  // ── Entries crudos (multi-round aware). ──
  // Cada entry incluye también su dbPlayerId para reconstruir playerIdToIndex
  // sobre el ranking primario después de ordenar.
  interface LegacyEntryWithMeta extends LeaderboardEntry {
    dbPlayerId: string
    todayVsPar: number
  }

  const entries: LegacyEntryWithMeta[] = withRounds.map((p) => {
    const hcp = p.handicap_at_registration ?? 0
    const sortedRounds = [...(p.rounds || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))

    // Gross/neto/stableford se DERIVAN de `hole_scores` con el motor canónico.
    // Antes se leían de `rounds.total_gross/total_net/total_points`, columnas que
    // sólo escribe `/api/game` al scorear: cualquier otro camino de entrada las
    // deja en 0 y el board pintaba al jugador como líder bajo par.
    const perRound = sortedRounds.map((round) => {
      const byHole: Record<string, number> = {}
      for (const hs of round.hole_scores || []) {
        if (hs.gross_score != null) byHole[String(hs.hole_number)] = hs.gross_score
      }
      return computeIndividualScore(byHole, courseHoles, hcp, totalHoyos)
    })

    const agg = sumIndividualScores(perRound)
    const roundsPlayed = sortedRounds.length
    const allFinished = sortedRounds.every((r) => r.status === 'closed' || r.status === 'official')
    const vsParDelModo = (s: { vsParNet: number; vsParGross: number }) =>
      modoJuego === 'neto' ? s.vsParNet : s.vsParGross

    // Multi-ronda: "today" es la ronda EN CURSO (la última con datos), no el
    // acumulado. Single-round: today == total.
    const ultimaConDatos = [...perRound].reverse().find((s) => s.hasData)

    return {
      name: resolvePlayerName(p.profiles?.name, p.player_name),
      cat: p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
      handicap: hcp,
      grossTotal: agg.grossTotal,
      netTotal: agg.netTotal,
      stablefordTotal: agg.stablefordTotal,
      stablefordScores: formatoJuego === 'stableford' ? [...agg.stablefordScores] : [],
      parPlayed: agg.parPlayed,
      holesPlayed: agg.holesPlayed,
      roundsPlayed,
      scores: agg.scores.length ? [...agg.scores] : new Array(totalHoyos).fill(null),
      status: (allFinished ? 'F' : 'live') as 'F' | 'live',
      dbPlayerId: p.id,
      todayVsPar: isMultiRound
        ? (ultimaConDatos ? vsParDelModo(ultimaConDatos) : 0)
        : vsParDelModo(agg),
    }
  })

  const primaryMode: RankingMode = formatoJuego === 'stableford' ? 'stableford' : modoJuego
  const rankOpts = { formatoJuego }

  // rankEntries devuelve { players, order } donde order[i] es el índice del
  // entry original cuyo Player quedó en posición final i (POST-countback).
  // Usamos `order` para mapear `todayVsPar` y `dbPlayerId` al orden final;
  // antes los mapeábamos pre-countback y los empates rompían el mapeo.
  const applyToday = (players: Player[], order: number[]): Player[] =>
    players.map((p, idx) => {
      const originalIdx = order[idx]
      const e = entries[originalIdx]
      return { ...p, today: e?.todayVsPar ?? p.today }
    })

  const primaryRanked = rankEntries(entries, primaryMode, rankOpts)
  const grossRanked = rankEntries(entries, 'gross', rankOpts)
  const netoRanked = rankEntries(entries, 'neto', rankOpts)

  const primaryPlayers = applyToday(primaryRanked.players, primaryRanked.order)
  const playersByGross = applyToday(grossRanked.players, grossRanked.order)
  const playersByNeto = applyToday(netoRanked.players, netoRanked.order)

  // playerIdToIndex sobre el ranking primario, usando el order FINAL.
  primaryRanked.order.forEach((originalIdx, finalIdx) => {
    const e = entries[originalIdx]
    if (e) playerIdToIndex[e.dbPlayerId] = finalIdx
  })

  // ── Jugadores sin ronda aún (inscritos, no empezaron). ──
  // Se agregan al final del ranking primario. NO van a gross/neto rankings
  // (no tienen datos), pero el playerIdToIndex sí los registra para que
  // los grupos puedan localizarlos.
  const noRound = dbPlayers.filter((p) => !p.rounds?.length)
  noRound.forEach((p, i) => {
    const playerIdx = primaryPlayers.length
    primaryPlayers.push({
      pos:     withRounds.length + i + 1,
      name:    resolvePlayerName(p.profiles?.name, p.player_name),
      country: 'CL',
      cat:     p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
      hcp:     p.handicap_at_registration ?? 0,
      today:   0,
      total:   0,
      holes:   0,
      status:  'live',
      scores:  new Array(totalHoyos).fill(null),
    })
    playerIdToIndex[p.id] = playerIdx
  })

  // ── GWI inputs (independientes del orden). ──
  const gwiInputs: JugadorGWIInput[] = dbPlayers
    .filter((p) => p.rounds?.length > 0)
    .map((p) => {
      const hcp = p.handicap_at_registration ?? 18
      const holeScores = p.rounds[0].hole_scores ?? []
      let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

      for (const hs of holeScores) {
        if (!hs.gross_score) continue
        const hole = holeMap.get(hs.hole_number)
        if (!hole) continue
        hoyosComp++
        overUnderGross += hs.gross_score - hole.par
        overUnderNeto  += (hs.gross_score - strokesRecibidosEnHoyo(hcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)) - hole.par
        totalSF        += puntosStablefordHoyo(hs.gross_score, hole.par, hcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)
      }

      const currentScore = formatoJuego === 'stableford'
        ? totalSF
        : modoJuego === 'neto' ? overUnderNeto : overUnderGross

      return {
        id:                   p.id,
        nombre:               resolvePlayerName(p.profiles?.name, p.player_name),
        handicapIndex:        hcp,
        currentScore,
        hoyosCompletados:     hoyosComp,
        modoJuego,
        formatoJuego,
        historicalAvg:        null,
        historicalRoundsCount: 0,
        courseAvg:            null,
        courseRoundsCount:    0,
        patterns:             null,
      } satisfies JugadorGWIInput
    })

  return {
    players: primaryPlayers,
    playersByGross,
    playersByNeto,
    gwiInputs,
    playerIdToIndex,
  }
}
