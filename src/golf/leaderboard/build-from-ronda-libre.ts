// src/golf/leaderboard/build-from-ronda-libre.ts
//
// Construye los leaderboards a partir de scores agregados de rondas libres
// vinculadas a tournament_groups (path NUEVO). Devuelve TRES rankings
// paralelos (gross, neto, primario según modo del torneo) más los inputs
// de GWI para el live tracker.

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { computeIndividualScore } from './individual-score'
import { resolvePlayerName } from './player-name'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { Player } from '@/lib/golf-data'
import type { DBRondaLibreJugador } from '@/app/torneo/[slug]/types'
import type {
  LeaderboardEntry,
  TournamentLeaderboardContext,
} from './types'
import { rankEntries, type RankingMode } from './rank-entries'

export interface RondaLibreLeaderboardOutput {
  /** Ranking primario: stableford-points si formatoJuego === 'stableford',
   *  si no por el modo elegido por el torneo (gross o neto). Mantiene la
   *  compat con el comportamiento previo del leaderboard. */
  players: Player[]
  /** Ranking forzado por gross (todos los formatos excepto match_play). */
  playersByGross: Player[]
  /** Ranking forzado por neto (todos los formatos excepto match_play). */
  playersByNeto: Player[]
  gwiInputs: JugadorGWIInput[]
}

export function buildLeaderboardFromRondaLibre(
  jugadores: DBRondaLibreJugador[],
  ctx: TournamentLeaderboardContext,
): RondaLibreLeaderboardOutput {
  const { totalHoyos, modoJuego, formatoJuego, courseHoles } = ctx
  const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))
  // Normaliza el stroke_index a permutación 1..N para ALOCAR golpes: garantiza
  // que Σ golpes == course handicap de la ronda aunque el SI de catálogo sea
  // 18h-impar en un loop de 9h (bug "net +12 Don Jorge" en el path de equipos,
  // #245/#246 — aquí el gemelo individual). No cambia el SI que se MUESTRA.
  // No-op si el SI ya es una permutación válida (18h post-migración de catálogo).
  const siAlloc = normalizedStrokeIndexByHole(courseHoles, totalHoyos)

  // ── Entries crudos (cero sort, cero countback, cero conversión a Player). ──
  const entries: LeaderboardEntry[] = jugadores.map((j) => {
    const hcp = j.handicap ?? 0
    const s = computeIndividualScore(j.scores || {}, courseHoles, hcp, totalHoyos)

    return {
      name: resolvePlayerName(j.nombre),
      handicap: hcp,
      hcpDisplay: j.handicap_display ?? hcp,
      grossTotal: s.grossTotal,
      netTotal: s.netTotal,
      stablefordTotal: s.stablefordTotal,
      stablefordScores: formatoJuego === 'stableford' ? [...s.stablefordScores] : [],
      parPlayed: s.parPlayed,
      holesPlayed: s.holesPlayed,
      roundsPlayed: 1,
      scores: [...s.scores],
      status: (s.holesPlayed >= totalHoyos ? 'F' : 'live') as 'F' | 'live',
    }
  })

  const primaryMode: RankingMode = formatoJuego === 'stableford' ? 'stableford' : modoJuego
  const rankOpts = { formatoJuego }

  const players = rankEntries(entries, primaryMode, rankOpts).players
  const playersByGross = rankEntries(entries, 'gross', rankOpts).players
  const playersByNeto = rankEntries(entries, 'neto', rankOpts).players

  // ── GWI inputs (independientes del orden — mismo behavior que antes). ──
  const gwiInputs: JugadorGWIInput[] = jugadores.map((j) => {
    // Neto/stableford del GWI usan el course handicap (j.handicap), igual que el
    // board; pero handicapIndex del GWI modela varianza por SKILL → índice crudo
    // (j.handicap_index) cuando está disponible. Fallback a j.handicap.
    const hcp = j.handicap ?? 18
    const hcpIndex = j.handicap_index ?? j.handicap ?? 18
    const scoresMap = j.scores || {}
    let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

    for (let h = 1; h <= totalHoyos; h++) {
      const gross = scoresMap[String(h)]
      if (gross == null) continue
      const hole = holeMap.get(h)
      if (!hole) continue
      hoyosComp++
      overUnderGross += gross - hole.par
      overUnderNeto += (gross - strokesRecibidosEnHoyo(hcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)) - hole.par
      totalSF += puntosStablefordHoyo(gross, hole.par, hcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)
    }

    const currentScore = formatoJuego === 'stableford'
      ? totalSF
      : modoJuego === 'neto' ? overUnderNeto : overUnderGross

    return {
      id:                   j.id,
      nombre:               j.nombre,
      handicapIndex:        hcpIndex,
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

  return { players, playersByGross, playersByNeto, gwiInputs }
}
