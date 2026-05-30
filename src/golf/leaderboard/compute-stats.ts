// src/golf/leaderboard/compute-stats.ts
//
// Estadísticas agregadas del torneo (best card, avg neto, eagles, birdies,
// hoyo más difícil/fácil). Las stats vs par SOLO usan rondas terminadas:
// una ronda parcial tiene total_gross/net parciales, y compararlos contra
// parTotal completo produce números absurdos del tipo "líder a -28" cuando
// en realidad nadie terminó. Las stats por hoyo (eagles, birdies, hole
// difficulty) sí usan rondas parciales porque se calculan hoyo a hoyo.

import type { CourseHole, TourneyStats } from './types'

interface DBPlayerWithRounds {
  profiles: { name: string } | null
  rounds: {
    total_gross: number
    total_net: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

export function computeStats(
  dbPlayers: DBPlayerWithRounds[],
  courseHoles: CourseHole[],
  parTotal: number,
): TourneyStats | null {
  const withScores = dbPlayers.filter((p) => p.rounds?.[0]?.hole_scores?.some((hs) => hs.gross_score != null))
  if (withScores.length === 0) return null

  const parMap = new Map<number, number>()
  courseHoles.forEach((h) => parMap.set(h.numero, h.par))

  const totalHoles = courseHoles.length || 18
  const finished = withScores.filter((p) =>
    (p.rounds[0].hole_scores?.length ?? 0) >= totalHoles
    && p.rounds[0].total_net != null,
  )

  const bySortedNet = [...finished].sort((a, b) => (a.rounds[0].total_net ?? 999) - (b.rounds[0].total_net ?? 999))
  const bestName = bySortedNet[0]?.profiles?.name ?? '—'
  const bestNet  = bySortedNet[0]?.rounds[0].total_net ?? 0

  const netVals = finished.map((p) => (p.rounds[0].total_net ?? 0) - parTotal)
  const avgNet  = netVals.length > 0 ? netVals.reduce((s, v) => s + v, 0) / netVals.length : 0

  let eagles = 0, birdies = 0
  const holeSums: Record<number, { total: number; count: number }> = {}

  withScores.forEach((p) => {
    p.rounds[0].hole_scores.forEach((hs) => {
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
