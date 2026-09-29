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
// QUÉ SE RENDERIZA HOY, para no confundir al próximo que lea esto:
// de todo lo que devuelve `TourneyStats`, la UI sólo consume `eagles` y
// `birdies`, vía `computeTournamentResults`. La tarjeta de stats que mostraba
// "mejor tarjeta / promedio neto / hoyo más difícil" se sacó en `a002ba12`, así
// que `bestName`, `bestNet`, `avgNet`, `hardestHole` y `easiestHole` se
// calculan y no se pintan en ninguna pantalla. Se mantienen correctos igual —
// si la tarjeta vuelve, vuelve bien — pero NINGÚN usuario vio nunca un número
// malo de estos campos.
//
// De dónde sale cada número:
//  - Neto (mejor tarjeta, promedio): del RANKING que ya produjo el motor. Antes
//    se leía de `rounds[0].total_net`, la columna denormalizada que sólo escribe
//    /api/game y que queda en 0 si los scores entraron por otro camino. Además
//    sólo miraba la ronda 1, así que en multi-ronda ignoraba el resto.
//  - Por hoyo (eagles, birdies, dificultad): de `hole_scores`, que es el dato
//    crudo y no depende de ninguna columna derivada. Recorre TODAS las rondas
//    del jugador, y cada ronda se mide contra el par de SU cancha
//    (`holesByRound`): en un torneo multi-ronda con canchas distintas, un 4 en
//    el hoyo 1 es birdie en una cancha y par en la otra.

import { isFinishedCard } from './board-rules'
import type { Player } from '@/lib/golf-data'
import type { CourseHole, RoundLeaderboardContext, TourneyStats } from './types'

interface DBPlayerWithRounds {
  profiles: { name: string } | null
  rounds: {
    round_number?: number | null
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

export function computeStats(
  dbPlayers: DBPlayerWithRounds[],
  courseHoles: CourseHole[],
  /** Ranking neto del MISMO motor que el board. Fuente del neto que se muestra. */
  playersByNeto: Player[],
  /**
   * Contexto de las rondas que se juegan en OTRA cancha que la ronda 1, por
   * `round_number` (el mismo `ctx.rounds` del board). Las rondas ausentes
   * usan `courseHoles`. Sin él: una sola cancha, conducta previa.
   */
  rounds?: ReadonlyMap<number, Pick<RoundLeaderboardContext, 'courseHoles' | 'courseId'>> | null,
  /** `courses.id` de la cancha de la ronda 1 (para agrupar la dificultad por cancha). */
  baseCourseId: string | null = null,
): TourneyStats | null {
  const withScores = dbPlayers.filter((p) =>
    p.rounds?.some((r) => r.hole_scores?.some((hs) => hs.gross_score != null)),
  )
  if (withScores.length === 0) return null

  // ── Neto: sale del ranking, no de una columna ──
  // `isFinishedCard` es el MISMO portero que usa el podio: una sola definición
  // de "tarjeta terminada" para las dos superficies que comparan jugadores.
  const finished = playersByNeto.filter(isFinishedCard)

  // `netTotal` son golpes netos absolutos; `total` es esos mismos golpes vs el
  // par de los hoyos jugados. NO se toma `finished[0]`: el ranking está ordenado
  // por vs par, no por neto absoluto, y el countback puede reordenar dentro de
  // un empate. Con tarjetas de distinto largo el primero vs-par no es el de
  // menos golpes. Se busca el mínimo explícito.
  const best = finished.reduce<Player | null>(
    (mejor, p) => (mejor == null || (p.netTotal ?? Infinity) < (mejor.netTotal ?? Infinity) ? p : mejor),
    null,
  )
  const bestName = best?.name ?? '—'
  const bestNet = best?.netTotal ?? 0

  const avgNet = finished.length > 0
    ? finished.reduce((sum, p) => sum + p.total, 0) / finished.length
    : 0

  // ── Por hoyo: del dato crudo, todas las rondas, cada una con SU par ──
  const parMapDe = (holes: CourseHole[]): Map<number, number> =>
    new Map(holes.map((h) => [h.numero, h.par]))
  const parMapBase = parMapDe(courseHoles)
  const parMapPorRonda = new Map<number, Map<number, number>>()
  const parMapDeRonda = (roundNumber: number): Map<number, number> => {
    const propios = rounds?.get(roundNumber)?.courseHoles
    if (!propios) return parMapBase
    let m = parMapPorRonda.get(roundNumber)
    if (!m) {
      m = parMapDe(propios)
      parMapPorRonda.set(roundNumber, m)
    }
    return m
  }
  /** La cancha de la ronda: la real (`courseId`) cuando se conoce; si no, la
   *  ronda misma como grupo propio. Las rondas sin contexto propio son la
   *  cancha de la ronda 1. */
  const canchaDe = (roundNumber: number): string => {
    const rc = rounds?.get(roundNumber)
    if (!rc) return baseCourseId ?? 'base'
    return rc.courseId ?? `r${roundNumber}`
  }

  let eagles = 0, birdies = 0
  // La dificultad se agrupa por (cancha, hoyo): el hoyo 7 de la cancha A y el
  // hoyo 7 de la cancha B son hoyos distintos, y A,B,A,B son DOS canchas, no
  // cuatro rondas.
  const holeSums = new Map<string, { hole: number; courseId: string | null; total: number; count: number }>()

  withScores.forEach((p) => {
    p.rounds.forEach((r) => {
      const roundNumber = r.round_number ?? 1
      const parMap = parMapDeRonda(roundNumber)
      const cancha = canchaDe(roundNumber)
      const courseId = rounds?.get(roundNumber)?.courseId ?? baseCourseId
      ;(r.hole_scores || []).forEach((hs) => {
        if (hs.gross_score == null) return
        const par = parMap.get(hs.hole_number)
        if (par == null) return
        const diff = hs.gross_score - par
        if (diff <= -2) eagles++
        if (diff === -1) birdies++
        const key = `${cancha}#${hs.hole_number}`
        const acc = holeSums.get(key) ?? { hole: hs.hole_number, courseId: courseId ?? null, total: 0, count: 0 }
        acc.total += diff
        acc.count++
        holeSums.set(key, acc)
      })
    })
  })

  let hardestHole: TourneyStats['hardestHole'] = null
  let easiestHole: TourneyStats['easiestHole'] = null
  let maxAvg = -Infinity, minAvg = Infinity

  holeSums.forEach(({ hole, courseId, total, count }) => {
    const avg = total / count
    if (avg > maxAvg) { maxAvg = avg; hardestHole = { hole, avg, courseId } }
    if (avg < minAvg) { minAvg = avg; easiestHole = { hole, avg, courseId } }
  })

  return { bestName, bestNet, avgNet, eagles, birdies, hardestHole, easiestHole }
}
