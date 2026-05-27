// src/golf/leaderboard/build-from-legacy.ts
//
// Construye el leaderboard del torneo a partir del schema legacy
// `players` + `rounds` + `hole_scores`. Multi-round aware: acumula totals
// across rounds y aplica countback como tiebreaker.

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { resolveLeaderboardTies } from '@/golf/core/countback'
import type { CountbackPlayer, CountbackMode } from '@/golf/core/countback'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { Player } from '@/lib/golf-data'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { TournamentLeaderboardContext } from './types'

export interface LegacyLeaderboardOutput {
  players: Player[]
  gwiInputs: JugadorGWIInput[]
  playerIdToIndex: Record<string, number>
}

export function buildLeaderboardFromLegacy(
  dbPlayers: DBPlayer[],
  ctx: TournamentLeaderboardContext,
  tournamentTotalRounds: number,
): LegacyLeaderboardOutput {
  const { totalHoyos, parTotal, modoJuego, formatoJuego, courseHoles } = ctx
  const players: Player[] = []
  const playerIdToIndex: Record<string, number> = {}

  if (dbPlayers.length === 0) {
    return { players, gwiInputs: [], playerIdToIndex }
  }

  const isMultiRound = tournamentTotalRounds > 1
  const withRounds = dbPlayers.filter((p) => p.rounds?.length > 0)
  const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))

  const legacyEntries = withRounds.map((p) => {
    const hcp = p.handicap_at_registration ?? 0
    const sortedRounds = [...(p.rounds || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))

    let cumulGross = 0, cumulNet = 0, cumulPoints = 0, totalHolesPlayed = 0
    let latestScores = new Array(totalHoyos).fill(null) as (number | null)[]
    let allFinished = true

    for (const round of sortedRounds) {
      cumulGross += round.total_gross ?? 0
      cumulNet += round.total_net ?? 0
      cumulPoints += round.total_points ?? 0

      const scores = new Array(totalHoyos).fill(null) as (number | null)[]
      ;(round.hole_scores || []).forEach((hs) => {
        if (hs.gross_score != null) scores[hs.hole_number - 1] = hs.gross_score
      })
      const roundHoles = scores.filter((s) => s !== null).length
      totalHolesPlayed += roundHoles

      if (round.status !== 'closed' && round.status !== 'official') allFinished = false
      latestScores = scores
    }

    const roundsPlayed = sortedRounds.length
    const netVsPar = totalHolesPlayed > 0 ? cumulNet - (parTotal * roundsPlayed) : 0
    const latestRound = sortedRounds[sortedRounds.length - 1]
    const todayNet = latestRound ? (latestRound.total_net ?? 0) - parTotal : 0

    const stablefordScores: number[] = formatoJuego === 'stableford'
      ? Array.from({ length: totalHoyos }, (_, i) => {
          const h = i + 1
          const gross = latestScores[i] ?? 0
          if (gross === 0) return 0
          const hole = holeMap.get(h)
          if (!hole) return 0
          return puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
        })
      : []

    return {
      dbPlayer: p,
      hcp,
      scores: latestScores,
      stablefordScores,
      holesPlayed: totalHolesPlayed,
      netVsPar,
      todayVsPar: isMultiRound ? todayNet : netVsPar,
      grossTotal: cumulGross,
      netTotal: cumulNet,
      stablefordTotal: cumulPoints,
      status: (allFinished ? 'F' : 'live') as 'F' | 'live',
    }
  })

  legacyEntries.sort((a, b) => {
    if (formatoJuego === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
    if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
    return (a.grossTotal || 999) - (b.grossTotal || 999)
  })

  const cbMode: CountbackMode = formatoJuego === 'stableford' ? 'higher_wins' : 'lower_wins'
  const cbPlayers: CountbackPlayer[] = legacyEntries.map((e, idx) => ({
    id: String(idx),
    name: e.dbPlayer.profiles?.name || 'Jugador',
    scores: formatoJuego === 'stableford'
      ? (e.stablefordScores ?? e.scores.map((s) => s ?? 0))
      : e.scores.map((s) => s ?? 0),
    primaryScore: formatoJuego === 'stableford'
      ? e.stablefordTotal
      : modoJuego === 'neto' ? e.netTotal : e.grossTotal,
  }))
  const cbResults = resolveLeaderboardTies(cbPlayers, cbMode)

  cbResults.forEach((r, idx) => {
    const e = legacyEntries[parseInt(r.id)]
    const nameWithAnnotation = r.annotation ? `${r.name} ${r.annotation}` : r.name
    players.push({
      pos:     idx + 1,
      name:    nameWithAnnotation,
      country: 'CL',
      cat:     e.dbPlayer.categories?.name ? `Cat. ${e.dbPlayer.categories.name}` : 'General',
      hcp:     e.hcp,
      today:   e.todayVsPar,
      total:   e.netVsPar,
      holes:   e.holesPlayed,
      status:  e.status,
      scores:  e.scores,
    })
    playerIdToIndex[e.dbPlayer.id] = idx
  })

  // Players sin ronda aún (inscritos pero no empezaron)
  const noRound = dbPlayers.filter((p) => !p.rounds?.length)
  noRound.forEach((p, i) => {
    const playerIdx = players.length
    players.push({
      pos:     withRounds.length + i + 1,
      name:    p.profiles?.name ?? p.player_name ?? 'Jugador',
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

  // GWI inputs
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
        overUnderNeto  += (hs.gross_score - strokesRecibidosEnHoyo(hcp, hole.stroke_index)) - hole.par
        totalSF        += puntosStablefordHoyo(hs.gross_score, hole.par, hcp, hole.stroke_index)
      }

      const currentScore = formatoJuego === 'stableford'
        ? totalSF
        : modoJuego === 'neto' ? overUnderNeto : overUnderGross

      return {
        id:                   p.id,
        nombre:               p.profiles?.name ?? p.player_name ?? 'Jugador',
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

  return { players, gwiInputs, playerIdToIndex }
}
