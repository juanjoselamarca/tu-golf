import { describe, it, expect } from 'vitest'
import {
  scoringTrendLast5,
  frontBackNine,
  type BucketRound,
} from './personal'

/** Ronda 18h sintética: gross + scores de 18 hoyos (par 4 implícito). */
function r18(total_gross: number, over: Partial<BucketRound> = {}): BucketRound {
  return { total_gross, holes_played: 18, scores: Array(18).fill(Math.round(total_gross / 18)), ...over }
}
function r9(total_gross: number, over: Partial<BucketRound> = {}): BucketRound {
  return { total_gross, holes_played: 9, scores: Array(9).fill(Math.round(total_gross / 9)), ...over }
}

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
