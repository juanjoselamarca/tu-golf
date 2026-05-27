// src/golf/leaderboard/build-from-legacy.ts
//
// Construye los leaderboards desde el schema legacy `players` + `rounds` +
// `hole_scores`. Multi-round aware. Devuelve TRES rankings paralelos
// (gross, neto, primario por modo del torneo) + inputs GWI + mapping
// playerId→index del ranking primario (para mostrar grupos).

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
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
  const { totalHoyos, parTotal, modoJuego, formatoJuego, courseHoles } = ctx
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
      name: p.profiles?.name || 'Jugador',
      cat: p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
      handicap: hcp,
      grossTotal: cumulGross,
      netTotal: cumulNet,
      stablefordTotal: cumulPoints,
      stablefordScores,
      vsPar: netVsPar,
      holesPlayed: totalHolesPlayed,
      roundsPlayed,
      scores: latestScores,
      status: (allFinished ? 'F' : 'live') as 'F' | 'live',
      dbPlayerId: p.id,
      todayVsPar: isMultiRound ? todayNet : netVsPar,
    }
  })

  const primaryMode: RankingMode = formatoJuego === 'stableford' ? 'stableford' : modoJuego
  const rankOpts = { parTotal, formatoJuego }

  // Para los rankings finales necesitamos también el `today` específico del legacy
  // (multi-round). Lo aplicamos como post-step que actualiza Player.today.
  const applyToday = (players: Player[], orderedEntries: LegacyEntryWithMeta[]): Player[] =>
    players.map((p, idx) => ({ ...p, today: orderedEntries[idx]?.todayVsPar ?? p.today }))

  // rankEntries usa el orden FINAL del sort que aplica internamente. Para que
  // el array de entries reordenado coincida con `players`, replicamos el mismo
  // sort key acá (solo afecta el cálculo de `today`, no `total`).
  const sortFor = (mode: RankingMode) => [...entries].sort((a, b) => {
    if (mode === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
    const aVal = mode === 'gross' ? (a.grossTotal || 999) : (a.netTotal || 999)
    const bVal = mode === 'gross' ? (b.grossTotal || 999) : (b.netTotal || 999)
    return aVal - bVal
  })

  const primaryPlayers = applyToday(rankEntries(entries, primaryMode, rankOpts), sortFor(primaryMode))
  const playersByGross = applyToday(rankEntries(entries, 'gross', rankOpts), sortFor('gross'))
  const playersByNeto = applyToday(rankEntries(entries, 'neto', rankOpts), sortFor('neto'))

  // ── playerIdToIndex sobre el ranking primario. ──
  // Si dos jugadores se empatan, su anotación queda en r.name pero `dbPlayerId`
  // sigue siendo el mismo — usamos el orden devuelto por sortFor(primary) que
  // coincide 1:1 con primaryPlayers.
  const orderedPrimary = sortFor(primaryMode)
  orderedPrimary.forEach((e, idx) => {
    playerIdToIndex[e.dbPlayerId] = idx
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

  return {
    players: primaryPlayers,
    playersByGross,
    playersByNeto,
    gwiInputs,
    playerIdToIndex,
  }
}
