// src/golf/leaderboard/compute-stats.ts
//
// Estadísticas agregadas del torneo (mejor tarjeta, promedio neto, eagles,
// birdies, hoyo más difícil/fácil).
//
// Las stats vs par SOLO miran tarjetas terminadas: una ronda a medias comparada
// contra la vuelta completa produce números absurdos del tipo "líder a −28" sin
// que nadie haya terminado. Las stats por hoyo (eagles, birdies, dificultad) sí
// usan rondas parciales, porque se calculan hoyo a hoyo.
//
// De dónde sale cada número:
//  - Neto (mejor tarjeta, promedio): del RANKING que ya produjo el motor. Antes
//    se leía de `rounds[0].total_net`, la columna denormalizada que sólo escribe
//    /api/game: si los scores entraron por cualquier otro camino queda en 0 y la
//    landing mostraba "mejor tarjeta 0" al lado de un board correcto — dos
//    respuestas distintas al mismo concepto en una sola pantalla. Además sólo
//    miraba la ronda 1, así que en multi-ronda ignoraba el resto.
//  - Por hoyo (eagles, birdies, dificultad): de `hole_scores`, que es el dato
//    crudo y no depende de ninguna columna derivada. Ahora recorre TODAS las
//    rondas del jugador, no sólo la primera.

import type { Player } from '@/lib/golf-data'
import type { CourseHole, TourneyStats } from './types'

interface DBPlayerWithRounds {
  profiles: { name: string } | null
  rounds: {
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

export function computeStats(
  dbPlayers: DBPlayerWithRounds[],
  courseHoles: CourseHole[],
  /** Ranking neto del MISMO motor que el board. Fuente del neto que se muestra. */
  playersByNeto: Player[],
): TourneyStats | null {
  const withScores = dbPlayers.filter((p) =>
    p.rounds?.some((r) => r.hole_scores?.some((hs) => hs.gross_score != null)),
  )
  if (withScores.length === 0) return null

  // ── Neto: sale del ranking, no de una columna ──
  // Mismo predicado de "terminado" que usa el podio (`compute-tournament-results`).
  const finished = playersByNeto.filter((p) => p.status === 'F' && p.holes > 0)

  // `netTotal` son golpes netos absolutos; `total` es esos mismos golpes vs el
  // par de los hoyos jugados. El ranking ya viene ordenado por neto, así que el
  // primero terminado ES la mejor tarjeta.
  const best = finished[0]
  const bestName = best?.name ?? '—'
  const bestNet = best?.netTotal ?? 0

  const avgNet = finished.length > 0
    ? finished.reduce((sum, p) => sum + p.total, 0) / finished.length
    : 0

  // ── Por hoyo: del dato crudo, todas las rondas ──
  const parMap = new Map<number, number>()
  courseHoles.forEach((h) => parMap.set(h.numero, h.par))

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
