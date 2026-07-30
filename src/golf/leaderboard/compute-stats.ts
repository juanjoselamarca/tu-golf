// src/golf/leaderboard/compute-stats.ts
//
// Estadísticas agregadas del torneo (mejor tarjeta, promedio neto, eagles,
// birdies, hoyo más difícil/fácil).
//
// Las stats vs par SOLO usan rondas terminadas: una ronda parcial comparada
// contra el par completo produce números absurdos ("líder a −28" sin que nadie
// haya terminado). Las stats por hoyo (eagles, birdies, dificultad) sí usan
// rondas parciales, porque se calculan hoyo a hoyo.
//
// El neto se DERIVA con el mismo motor que el board (`computeIndividualScore`).
// Antes se leía de `rounds.total_net`, la columna que sólo escribe /api/game al
// scorear: en los mismos torneos que el board arregla (seed, import, edición
// manual) esa columna queda en 0, así que la landing mostraba "mejor tarjeta 0"
// al lado de un board correcto — dos respuestas distintas a "cuál es el neto"
// en una misma pantalla.

import { computeIndividualScore, sumIndividualScores } from './individual-score'
import { resolvePlayerName } from './player-name'
import { scoringHandicapOf, type ScoringHandicaps } from './scoring-handicap'
import type { CourseHole, TourneyStats } from './types'

interface DBPlayerWithRounds {
  id: string
  handicap_at_registration: number | null
  player_name?: string | null
  profiles: { name: string } | null
  rounds: {
    round_number?: number | null
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

export function computeStats(
  dbPlayers: DBPlayerWithRounds[],
  courseHoles: CourseHole[],
  totalHoles: number,
  scoringHandicaps?: ScoringHandicaps,
): TourneyStats | null {
  const withScores = dbPlayers.filter((p) =>
    p.rounds?.some((r) => r.hole_scores?.some((hs) => hs.gross_score != null)),
  )
  if (withScores.length === 0) return null

  const parMap = new Map<number, number>()
  courseHoles.forEach((h) => parMap.set(h.numero, h.par))

  // Score derivado por jugador, acumulando todas sus rondas.
  const scored = withScores.map((p) => {
    const hcp = scoringHandicapOf(scoringHandicaps, p.id, p.handicap_at_registration)
    const perRound = [...p.rounds]
      .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))
      .map((r) => {
        const byHole: Record<string, number> = {}
        for (const hs of r.hole_scores || []) {
          if (hs.gross_score != null) byHole[String(hs.hole_number)] = hs.gross_score
        }
        return computeIndividualScore(byHole, courseHoles, hcp, totalHoles)
      })
    return { player: p, perRound, score: sumIndividualScores(perRound) }
  })

  // "Terminado" = completó al menos una ronda entera.
  const finished = scored.filter((s) => s.score.holesPlayed >= totalHoles)

  // "Mejor tarjeta" = la mejor RONDA completa, no el acumulado: en un torneo de
  // dos vueltas, comparar el acumulado de quien lleva una (72) contra el de
  // quien lleva dos (144) siempre corona al que va más atrasado.
  const rondasCompletas = finished.flatMap((s) =>
    s.perRound
      .filter((r) => r.holesPlayed >= totalHoles)
      .map((r) => ({ player: s.player, net: r.netTotal })),
  )
  const best = [...rondasCompletas].sort((a, b) => a.net - b.net)[0]
  const bestName = best
    ? resolvePlayerName(best.player.profiles?.name, best.player.player_name)
    : '—'
  const bestNet = best?.net ?? 0

  const avgNet = finished.length > 0
    ? finished.reduce((sum, s) => sum + s.score.vsParNet, 0) / finished.length
    : 0

  let eagles = 0, birdies = 0
  const holeSums: Record<number, { total: number; count: number }> = {}

  withScores.forEach((p) => {
    p.rounds.forEach((r) => {
      ;(r.hole_scores || []).forEach((hs) => {
        if (hs.gross_score == null) return
        const par = parMap.get(hs.hole_number)
        if (par == null) return
        const diff = hs.gross_score - par
        if (diff <= -2) eagles++
        if (diff === -1) birdies++
        if (!holeSums[hs.hole_number]) holeSums[hs.hole_number] = { total: 0, count: 0 }
        holeSums[hs.hole_number].total += diff
        holeSums[hs.hole_number].count++
      })
    })
  })

  let hardestHole: TourneyStats['hardestHole'] = null
  let easiestHole: TourneyStats['easiestHole'] = null
  let maxAvg = -Infinity, minAvg = Infinity

  Object.entries(holeSums).forEach(([hStr, { total, count }]) => {
    const avg = total / count
    const h   = parseInt(hStr)
    if (avg > maxAvg) { maxAvg = avg; hardestHole = { hole: h, avg } }
    if (avg < minAvg) { minAvg = avg; easiestHole = { hole: h, avg } }
  })

  return { bestName, bestNet, avgNet, eagles, birdies, hardestHole, easiestHole }
}
