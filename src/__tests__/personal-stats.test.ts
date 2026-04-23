/**
 * Tests para src/golf/stats/personal.ts — calcPersonalStats().
 *
 * calcPersonalStats es la función que alimenta el dashboard del usuario
 * con stats agregadas (mejor ronda, promedio, conteo eagles/birdies, top 5).
 * Bug aquí → el jugador ve números incorrectos en su perfil.
 *
 * Cobertura previa: 0%. Meta: ≥80%.
 */
import { describe, it, expect } from 'vitest'
import { calcPersonalStats } from '@/golf/stats/personal'
import type { RoundForCompare } from '@/golf/stats/personal'

type R = RoundForCompare & {
  course_name?: string
  played_at?: string
  hole_pars?: number[] | null
}

// Helpers para construir rondas
function round18(opts: { gross: number; par?: number; course?: string; date?: string; scores?: (number | null)[]; hole_pars?: number[] }): R {
  return {
    total_gross: opts.gross,
    par_total: opts.par ?? 72,
    holes_played: 18,
    scores: opts.scores ?? null,
    hole_pars: opts.hole_pars ?? null,
    course_name: opts.course ?? 'Test Course',
    played_at: opts.date ?? '2026-04-01',
  }
}

function round9(opts: { gross: number; par?: number; course?: string; date?: string }): R {
  return {
    total_gross: opts.gross,
    par_total: opts.par ?? 36,
    holes_played: 9,
    course_name: opts.course ?? 'Test 9',
    played_at: opts.date ?? '2026-04-02',
  }
}

describe('calcPersonalStats', () => {
  it('array vacío → totals en 0 y bests en null', () => {
    const stats = calcPersonalStats([])
    expect(stats.totalRounds).toBe(0)
    expect(stats.totalRounds18).toBe(0)
    expect(stats.totalRounds9).toBe(0)
    expect(stats.avgOverPar18).toBeNull()
    expect(stats.avgOverPar9).toBeNull()
    expect(stats.bestRound18).toBeNull()
    expect(stats.bestRound9).toBeNull()
    expect(stats.topRounds).toHaveLength(0)
    expect(stats.totalEagles).toBe(0)
  })

  it('separa rondas 9h y 18h correctamente', () => {
    const stats = calcPersonalStats([
      round18({ gross: 75 }),
      round18({ gross: 80 }),
      round9({ gross: 40 }),
    ])
    expect(stats.totalRounds).toBe(3)
    expect(stats.totalRounds18).toBe(2)
    expect(stats.totalRounds9).toBe(1)
  })

  it('best round 18h = menor vsPar (NO menor gross con par distinto)', () => {
    // R1: 72 sobre par 70 → +2
    // R2: 74 sobre par 73 → +1 ← este es mejor aunque gross mayor
    const stats = calcPersonalStats([
      round18({ gross: 72, par: 70, course: 'A' }),
      round18({ gross: 74, par: 73, course: 'B' }),
    ])
    expect(stats.bestRound18?.course).toBe('B')
    expect(stats.bestRound18?.vsPar).toBe(1)
  })

  it('avgOverPar18 redondeado a 1 decimal', () => {
    // vsPar de rondas par 72: 3, 4, 5 → avg 4.0
    const stats = calcPersonalStats([
      round18({ gross: 75 }),
      round18({ gross: 76 }),
      round18({ gross: 77 }),
    ])
    expect(stats.avgOverPar18).toBe(4)
  })

  it('avgOverPar9 separado de 18h', () => {
    const stats = calcPersonalStats([
      round18({ gross: 75 }),   // +3
      round9({ gross: 40 }),    // +4
      round9({ gross: 38 }),    // +2
    ])
    expect(stats.avgOverPar18).toBe(3)
    expect(stats.avgOverPar9).toBe(3) // avg de 4 y 2
  })

  it('best round usa vsPar no gross — caso 9 hoyos', () => {
    const stats = calcPersonalStats([
      round9({ gross: 38, par: 36, course: 'C' }),  // +2
      round9({ gross: 40, par: 35, course: 'D' }),  // +5
    ])
    expect(stats.bestRound9?.course).toBe('C')
    expect(stats.bestRound9?.vsPar).toBe(2)
  })

  it('topRounds devuelve max 5 ordenadas por vsPar', () => {
    const rounds = [
      round18({ gross: 80, course: 'A' }),  // +8
      round18({ gross: 75, course: 'B' }),  // +3
      round18({ gross: 90, course: 'C' }),  // +18
      round18({ gross: 72, course: 'D' }),  // 0
      round18({ gross: 85, course: 'E' }),  // +13
      round18({ gross: 78, course: 'F' }),  // +6
      round18({ gross: 100, course: 'G' }), // +28
    ]
    const stats = calcPersonalStats(rounds)
    expect(stats.topRounds).toHaveLength(5)
    // La mejor primero (vsPar más bajo)
    expect(stats.topRounds[0].course_name).toBe('D')
    expect(stats.topRounds[0].computedVsPar).toBe(0)
    // La 5ta peor NO debe estar
    expect(stats.topRounds.find(r => r.course_name === 'G')).toBeUndefined()
  })

  it('cuenta eagles/birdies/pars/bogeys/doubles con scores y pars reales', () => {
    // Ronda 1: 3 pares, 3 birdies, 3 bogeys (par 4 todos)
    const scores1 = [4, 4, 4, 3, 3, 3, 5, 5, 5]
    const pars1 = [4, 4, 4, 4, 4, 4, 4, 4, 4]
    // Ronda 2: 2 eagles, 2 dobles (par 4)
    const scores2 = [2, 2, 6, 6, 4, 4, 4, 4, 4]
    const pars2 = [4, 4, 4, 4, 4, 4, 4, 4, 4]
    const stats = calcPersonalStats([
      { ...round9({ gross: 36 }), scores: scores1, hole_pars: pars1 },
      { ...round9({ gross: 36 }), scores: scores2, hole_pars: pars2 },
    ])
    expect(stats.totalEagles).toBe(2)
    expect(stats.totalBirdies).toBe(3)
    expect(stats.totalPars).toBe(3 + 5) // 3 ronda1 + 5 ronda2
    expect(stats.totalBogeys).toBe(3)
    expect(stats.totalDoubles).toBe(2)
  })

  it('ronda sin scores ignorada para conteos', () => {
    const stats = calcPersonalStats([
      { ...round18({ gross: 72 }), scores: null },
    ])
    expect(stats.totalRounds).toBe(1)
    expect(stats.totalEagles).toBe(0)
    expect(stats.totalBirdies).toBe(0)
  })

  it('ronda con hole_pars null usa default par 4', () => {
    const scores = [3, 4, 5, 4, 4, 4, 4, 4, 4] // 1 birdie, 7 pars, 1 bogey (todos par 4)
    const stats = calcPersonalStats([
      { ...round9({ gross: 36 }), scores, hole_pars: null },
    ])
    expect(stats.totalBirdies).toBe(1)
    expect(stats.totalPars).toBe(7)
    expect(stats.totalBogeys).toBe(1)
  })

  it('ronda con scores no-array se ignora sin error', () => {
    const stats = calcPersonalStats([
      { ...round18({ gross: 72 }), scores: 'oops' as unknown as (number | null)[] },
    ])
    expect(stats.totalRounds).toBe(1)
    expect(stats.totalPars).toBe(0)
  })

  it('best round con course_name undefined devuelve string vacío', () => {
    const stats = calcPersonalStats([
      { ...round18({ gross: 75 }), course_name: undefined },
    ])
    expect(stats.bestRound18?.course).toBe('')
  })

  it('best round con played_at undefined devuelve string vacío', () => {
    const stats = calcPersonalStats([
      { ...round18({ gross: 75 }), played_at: undefined },
    ])
    expect(stats.bestRound18?.date).toBe('')
  })
})
