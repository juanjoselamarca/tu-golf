// src/golf/leaderboard/build-from-ronda-libre.ts
//
// Construye el leaderboard a partir de scores agregados de rondas libres
// vinculadas a tournament_groups (path NUEVO). Cada `ronda_libre_jugadores`
// row trae un `scores` JSONB con {hole: gross}. Acá lo expandimos a
// totales gross/neto/stableford + countback para tiebreaker.

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { resolveLeaderboardTies } from '@/golf/core/countback'
import type {
  CountbackPlayer,
  CountbackMode,
} from '@/golf/core/countback'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { Player } from '@/lib/golf-data'
import type { DBRondaLibreJugador } from '@/app/torneo/[slug]/types'
import type {
  LeaderboardEntry,
  TournamentLeaderboardContext,
} from './types'

export interface RondaLibreLeaderboardOutput {
  players: Player[]
  gwiInputs: JugadorGWIInput[]
}

export function buildLeaderboardFromRondaLibre(
  jugadores: DBRondaLibreJugador[],
  ctx: TournamentLeaderboardContext,
): RondaLibreLeaderboardOutput {
  const { totalHoyos, modoJuego, formatoJuego, courseHoles } = ctx
  const holeMap = new Map(courseHoles.map((h) => [h.numero, h]))

  const entries: LeaderboardEntry[] = jugadores.map((j) => {
    const hcp = j.handicap ?? 0
    const scoresMap = j.scores || {}
    const scoreArr = new Array(totalHoyos).fill(null) as (number | null)[]
    let grossTotal = 0, netTotal = 0, stablefordTotal = 0, holesPlayed = 0

    for (let h = 1; h <= totalHoyos; h++) {
      const gross = scoresMap[String(h)]
      if (gross != null) {
        scoreArr[h - 1] = gross
        grossTotal += gross
        const hole = holeMap.get(h)
        const strokes = hole ? strokesRecibidosEnHoyo(hcp, hole.stroke_index) : 0
        netTotal += gross - strokes
        if (hole) stablefordTotal += puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
        holesPlayed++
      }
    }

    const parPlayed = courseHoles
      .filter((ch) => scoresMap[String(ch.numero)] != null)
      .reduce((sum, ch) => sum + ch.par, 0)

    const stablefordScores: number[] = formatoJuego === 'stableford'
      ? Array.from({ length: totalHoyos }, (_, i) => {
          const h = i + 1
          const gross = scoreArr[i] ?? 0
          if (gross === 0) return 0
          const hole = holeMap.get(h)
          if (!hole) return 0
          return puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
        })
      : []

    return {
      name: j.nombre,
      handicap: hcp,
      grossTotal,
      netTotal,
      stablefordTotal,
      stablefordScores,
      vsPar: holesPlayed > 0 ? grossTotal - parPlayed : 0,
      holesPlayed,
      scores: scoreArr,
      status: (holesPlayed >= totalHoyos ? 'F' : 'live') as 'F' | 'live',
    }
  })

  entries.sort((a, b) => {
    if (formatoJuego === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
    if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
    return (a.grossTotal || 999) - (b.grossTotal || 999)
  })

  const cbMode: CountbackMode = formatoJuego === 'stableford' ? 'higher_wins' : 'lower_wins'
  const cbPlayers: CountbackPlayer[] = entries.map((e, idx) => ({
    id: String(idx),
    name: e.name,
    scores: formatoJuego === 'stableford'
      ? (e.stablefordScores ?? e.scores.map((s) => s ?? 0))
      : e.scores.map((s) => s ?? 0),
    primaryScore: formatoJuego === 'stableford'
      ? e.stablefordTotal
      : modoJuego === 'neto' ? e.netTotal : e.grossTotal,
  }))
  const cbResults = resolveLeaderboardTies(cbPlayers, cbMode)

  const annotationMap = new Map<string, string>()
  cbResults.forEach((r) => annotationMap.set(r.id, r.annotation))

  const reorderedEntries = cbResults.map((r) => {
    const e = entries[parseInt(r.id)]
    return { ...e, tieAnnotation: annotationMap.get(r.id) || '' }
  })

  const players: Player[] = reorderedEntries.map((e, idx): Player => ({
    pos:     idx + 1,
    name:    e.tieAnnotation ? `${e.name} ${e.tieAnnotation}` : e.name,
    country: 'CL',
    cat:     'General',
    hcp:     e.handicap,
    today:   e.vsPar,
    total:   e.vsPar,
    holes:   e.holesPlayed,
    status:  e.status,
    scores:  e.scores,
  }))

  const gwiInputs: JugadorGWIInput[] = jugadores.map((j) => {
    const hcp = j.handicap ?? 18
    const scoresMap = j.scores || {}
    let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

    for (let h = 1; h <= totalHoyos; h++) {
      const gross = scoresMap[String(h)]
      if (gross == null) continue
      const hole = holeMap.get(h)
      if (!hole) continue
      hoyosComp++
      overUnderGross += gross - hole.par
      overUnderNeto += (gross - strokesRecibidosEnHoyo(hcp, hole.stroke_index)) - hole.par
      totalSF += puntosStablefordHoyo(gross, hole.par, hcp, hole.stroke_index)
    }

    const currentScore = formatoJuego === 'stableford'
      ? totalSF
      : modoJuego === 'neto' ? overUnderNeto : overUnderGross

    return {
      id:                   j.id,
      nombre:               j.nombre,
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

  return { players, gwiInputs }
}
