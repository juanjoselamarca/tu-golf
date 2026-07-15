/**
 * computeHistorialStats — paridad con el route original + pines del fix
 * eagles/pares (bug inbox 2268163d / PR #254): pares REALES vía
 * buildCourseParMap (indexado por numero, order-independent), conteo
 * hoyo-a-hoyo, fallback a par estándar cuando no hay match.
 */
import { describe, it, expect } from 'vitest'
import { computeHistorialStats, type CourseHoleRow, type RawStatsRound } from './historial'

// Cancha A: 18 hoyos par 4 (par 72), matcheada por course_id.
const holesA: CourseHoleRow[] = Array.from({ length: 18 }, (_, i) => ({
  course_id: 'cA', numero: i + 1, par: 4,
}))
// Cancha B: 9 hoyos par 4 (par 36), matcheada por NOMBRE (course_id null en la ronda).
const holesB: CourseHoleRow[] = Array.from({ length: 9 }, (_, i) => ({
  course_id: 'cB', numero: i + 1, par: 4,
}))

const courses = [
  { id: 'cA', nombre: 'Club de Polo San Cristóbal' },
  { id: 'cB', nombre: 'Club de Golf La Dehesa' },
]

const round18: RawStatsRound = {
  id: 'r18', course_name: 'Club de Polo San Cristóbal', course_id: 'cA',
  played_at: '2026-03-15',
  // eagle, birdie, par, bogey, doble, y 13 pares → total 72 (E)
  scores: [2, 3, 4, 5, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  total_gross: 72, holes_played: 18, import_source: null,
}

const round9: RawStatsRound = {
  id: 'r9', course_name: 'Club de Golf La Dehesa', course_id: null,
  played_at: '2026-04-02',
  scores: [3, 3, 3, 3, 3, 3, 3, 3, 3], // 9 birdies, total 27 (-9)
  total_gross: 27, holes_played: 9, import_source: null,
}

describe('computeHistorialStats', () => {
  it('cuenta eagles/birdies/pares/bogeys/dobles hoyo-a-hoyo con pares REALES', () => {
    const stats = computeHistorialStats([round18], courses, holesA)
    expect(stats.totalEagles).toBe(1)
    expect(stats.totalBirdies).toBe(1)
    expect(stats.totalPars).toBe(14)
    expect(stats.totalBogeys).toBe(1)
    expect(stats.totalDoubles).toBe(1)
    expect(stats.totalRounds18).toBe(1)
    expect(stats.avgOverPar18).toBe(0)
  })

  it('es order-independent: los hoyos pueden llegar en CUALQUIER orden (fix #254)', () => {
    const shuffled = [...holesA].reverse()
    const ordered = computeHistorialStats([round18], courses, holesA)
    const chaos = computeHistorialStats([round18], courses, shuffled)
    expect(chaos).toEqual(ordered)
  })

  it('matchea por nombre cuando la ronda no tiene course_id', () => {
    const stats = computeHistorialStats([round9], courses, [...holesA, ...holesB])
    expect(stats.totalBirdies).toBe(9)
    expect(stats.totalRounds9).toBe(1)
    expect(stats.avgOverPar9).toBe(-9)
    expect(stats.bestRound9).toMatchObject({ score: 27, vsPar: -9, roundId: 'r9' })
  })

  it('sin match de cancha: vsPar cae a par estándar (36/72) y NO cuenta hoyo-a-hoyo', () => {
    const unknown: RawStatsRound = {
      ...round18, id: 'rX', course_name: 'Cancha Inexistente XYZ', course_id: null,
      scores: Array(18).fill(5), total_gross: 90,
    }
    const stats = computeHistorialStats([unknown], courses, holesA)
    expect(stats.totalEagles + stats.totalBirdies + stats.totalPars + stats.totalBogeys + stats.totalDoubles).toBe(0)
    expect(stats.avgOverPar18).toBe(18) // 90 - 72
  })

  it('cancha con MENOS pares que scores (9h vs ronda 18h) → fallback estándar, sin conteo', () => {
    const on9: RawStatsRound = {
      ...round18, id: 'rY', course_name: 'Club de Golf La Dehesa', course_id: 'cB',
      scores: Array(18).fill(4), total_gross: 72,
    }
    const stats = computeHistorialStats([on9], courses, holesB)
    expect(stats.totalPars).toBe(0) // no hay pares reales suficientes
    expect(stats.avgOverPar18).toBe(0) // 72 - 72 estándar
  })

  it('breakdown por cancha SOLO acumula rondas de 18h y agrupa por mes descendente', () => {
    const stats = computeHistorialStats([round18, round9], courses, [...holesA, ...holesB])
    expect(stats.courseBreakdown).toHaveLength(1)
    expect(stats.courseBreakdown[0]).toMatchObject({
      courseName: 'Club de Polo San Cristóbal', roundCount: 1, avgScore: 72, bestScore: 72,
    })
    expect(stats.roundsByMonth.map(m => m.month)).toEqual(['2026-04', '2026-03'])
    expect(stats.roundsByMonth.map(m => m.label)).toEqual(['Abril 2026', 'Marzo 2026'])
  })

  it('rondas sin scores se saltean; nulls dentro de scores se filtran', () => {
    const empty: RawStatsRound = { ...round18, id: 'rE', scores: [], total_gross: null }
    const withNulls: RawStatsRound = {
      ...round9, id: 'rN', scores: [3, null, 3, null, 3, null, 3, null, 3] as (number | null)[],
      total_gross: null, holes_played: null,
    }
    const stats = computeHistorialStats([empty, withNulls], courses, [...holesA, ...holesB])
    expect(stats.totalRounds).toBe(1)
    // 5 scores válidos contra los primeros 5 pares de cB → 5 birdies
    expect(stats.totalBirdies).toBe(5)
  })

  it('bestRound18 elige el vsPar más bajo y lleva roundId (tap-to-scroll)', () => {
    const worse: RawStatsRound = {
      ...round18, id: 'rW', played_at: '2026-02-01',
      scores: Array(18).fill(5), total_gross: 90,
    }
    const stats = computeHistorialStats([worse, round18], courses, holesA)
    expect(stats.bestRound18).toMatchObject({ score: 72, vsPar: 0, roundId: 'r18' })
  })
})
