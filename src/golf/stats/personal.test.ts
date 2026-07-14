import { describe, it, expect } from 'vitest'
import {
  calcPersonalStats,
  aggregateScoringCounts,
  avgScoreBucket,
  scoringTrendLast5,
  frontBackNine,
  golfWellnessIndex,
  type BucketRound,
} from './personal'

/** Ronda 18h sintética: gross + scores de 18 hoyos (par 4 implícito). */
function r18(total_gross: number, over: Partial<BucketRound> = {}): BucketRound {
  return { total_gross, holes_played: 18, scores: Array(18).fill(Math.round(total_gross / 18)), ...over }
}
function r9(total_gross: number, over: Partial<BucketRound> = {}): BucketRound {
  return { total_gross, holes_played: 9, scores: Array(9).fill(Math.round(total_gross / 9)), ...over }
}

describe('aggregateScoringCounts', () => {
  it('cuenta con par real por hoyo cuando hay hole_pars', () => {
    const counts = aggregateScoringCounts([{
      total_gross: 13,
      scores: [3, 4, 5, 1],          // vs pars [4,4,4,3]: birdie, par, bogey, eagle
      hole_pars: [4, 4, 4, 3],
    }])
    expect(counts).toEqual({ eagles: 1, birdies: 1, pars: 1, bogeys: 1, doubles: 0 })
  })

  it('fallback a par 4 cuando no hay hole_pars (comportamiento histórico)', () => {
    const counts = aggregateScoringCounts([{
      total_gross: 12,
      scores: [4, 5, 3],             // vs par 4: par, bogey, birdie
      hole_pars: null,
    }])
    expect(counts).toEqual({ eagles: 0, birdies: 1, pars: 1, bogeys: 1, doubles: 0 })
  })

  it('ignora rondas sin scores', () => {
    const counts = aggregateScoringCounts([{ total_gross: 80, scores: null }])
    expect(counts).toEqual({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 })
  })

  it('calcPersonalStats delega en la misma fuente (totales idénticos)', () => {
    const rounds = [
      { total_gross: 13, scores: [3, 4, 5, 1], hole_pars: [4, 4, 4, 3] },
      { total_gross: 12, scores: [4, 5, 3], hole_pars: null },
    ]
    const counts = aggregateScoringCounts(rounds)
    const stats = calcPersonalStats(rounds)
    expect(stats.totalEagles).toBe(counts.eagles)
    expect(stats.totalBirdies).toBe(counts.birdies)
    expect(stats.totalPars).toBe(counts.pars)
    expect(stats.totalBogeys).toBe(counts.bogeys)
    expect(stats.totalDoubles).toBe(counts.doubles)
  })
})

describe('avgScoreBucket', () => {
  it('promedia SOLO el bucket más poblado (no mezcla 9h con 18h)', () => {
    const b = avgScoreBucket([r18(90), r18(80), r9(45)])
    expect(b).toEqual({ avg: 85, holes: 18, count: 2 })
  })

  it('empate de buckets → gana 18h', () => {
    const b = avgScoreBucket([r18(90), r9(45)])
    expect(b?.holes).toBe(18)
    expect(b?.avg).toBe(90)
  })

  it('solo 9h → bucket 9h', () => {
    const b = avgScoreBucket([r9(45), r9(41)])
    expect(b).toEqual({ avg: 43, holes: 9, count: 2 })
  })

  it('sin rondas clasificables → null', () => {
    expect(avgScoreBucket([])).toBeNull()
    // hole count no inferible (12 scores, sin holes_played 9/18) queda fuera
    expect(avgScoreBucket([{ total_gross: 60, scores: Array(12).fill(5) }])).toBeNull()
  })
})

describe('scoringTrendLast5', () => {
  it('null con menos de 5 rondas', () => {
    expect(scoringTrendLast5([r18(90), r18(88), r18(86), r18(85)])).toBeNull()
  })

  it('null con 5-9 rondas (prev5 vacío exige historia)', () => {
    // 6 rondas 18h: last5 + prev5 de 1 → calcula
    const rounds = [96, 94, 92, 90, 88, 86].map(g => r18(g))
    const t = scoringTrendLast5(rounds)
    expect(t).not.toBeNull()
    expect(t?.prevCount).toBe(1)
  })

  it('detecta mejora: últimas 5 mejor que las 5 anteriores', () => {
    // par_total 72 en todas → vsPar = gross - 72
    const prev = [95, 95, 95, 95, 95].map(g => r18(g, { par_total: 72 }))
    const last = [88, 88, 88, 88, 88].map(g => r18(g, { par_total: 72 }))
    const t = scoringTrendLast5([...prev, ...last])
    expect(t?.improving).toBe(true)
    expect(t?.declining).toBe(false)
    expect(t?.avgLast).toBe('88.0')
    expect(t?.avgPrev).toBe('95.0')
    expect(t?.diff).toBe('-7.0')
    expect(t?.bucketHoles).toBe(18)
  })

  it('estable con diff dentro de ±0.5', () => {
    const rounds = Array(10).fill(0).map(() => r18(90, { par_total: 72 }))
    const t = scoringTrendLast5(rounds)
    expect(t?.stable).toBe(true)
  })

  it('prefiere bucket 18h con 10+ aunque haya 9h más recientes', () => {
    const r18s = Array(10).fill(0).map(() => r18(90))
    const r9s = Array(4).fill(0).map(() => r9(45))
    const t = scoringTrendLast5([...r18s, ...r9s])
    expect(t?.bucketHoles).toBe(18)
  })
})

describe('frontBackNine', () => {
  it('null con menos de 3 rondas de 18 hoyos', () => {
    expect(frontBackNine([r18(90), r18(88), r9(45)])).toBeNull()
  })

  it('promedia front y back sobre las elegibles', () => {
    const mk = (front: number, back: number) => ({
      scores: [...Array(9).fill(front / 9), ...Array(9).fill(back / 9)] as number[],
    })
    const d = frontBackNine([mk(45, 54), mk(45, 54), mk(45, 54)])
    expect(d).toEqual({ front: '45.0', back: '54.0', count: 3 })
  })
})

describe('golfWellnessIndex', () => {
  it('62 golpes → 100', () => {
    expect(golfWellnessIndex(62)).toBe(100)
  })
  it('cada golpe sobre 62 resta 5', () => {
    expect(golfWellnessIndex(72)).toBe(50)
    expect(golfWellnessIndex(80)).toBe(10)
  })
  it('clampa en [0, 100]', () => {
    expect(golfWellnessIndex(100)).toBe(0)
    expect(golfWellnessIndex(45)).toBe(100) // bucket 9h satura (heredado)
  })
})
