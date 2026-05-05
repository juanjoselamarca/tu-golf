import { describe, it, expect } from 'vitest'
import { PATTERNS, detectPatterns, type PatternRound } from './patterns'

function r(scores: (number | null)[], extra: Partial<PatternRound> = {}): PatternRound {
  const valid = scores.filter((s): s is number => typeof s === 'number')
  return {
    scores,
    total_gross: extra.total_gross ?? valid.reduce((a, b) => a + b, 0),
    par_total: extra.par_total ?? 72,
    course_name: extra.course_name ?? 'Test Course',
    played_at: extra.played_at ?? '2026-01-01T00:00:00Z',
    hole_pars: extra.hole_pars,
    metadata: extra.metadata ?? null,
  }
}

const FRONT14_PAR_AVG = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]

describe('pressure_deterioration', () => {
  const pattern = PATTERNS.find(p => p.id === 'pressure_deterioration')!

  it('exists with requires18Holes=true and severity=warning', () => {
    expect(pattern).toBeDefined()
    expect(pattern.requires18Holes).toBe(true)
    expect(pattern.severity).toBe('warning')
  })

  it('not detected with fewer than 5 eligible 18-hole rounds', () => {
    const rounds = Array.from({ length: 4 }, () =>
      r([...FRONT14_PAR_AVG, 8, 8, 8, 8])
    )
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('detected when last4 avg exceeds rest+1.5 in >=40% of rounds', () => {
    // 5 rondas: 4 con last4 avg = 8 vs rest avg = 4 (delta = +4 > 1.5)
    const rounds = [
      r([...FRONT14_PAR_AVG, 8, 8, 8, 8]),
      r([...FRONT14_PAR_AVG, 8, 8, 8, 8]),
      r([...FRONT14_PAR_AVG, 8, 8, 8, 8]),
      r([...FRONT14_PAR_AVG, 8, 8, 8, 8]),
      r([...FRONT14_PAR_AVG, 4, 4, 4, 4]),
    ]
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.confidence).toBeLessThanOrEqual(0.95)
    expect(result.metadata).toMatchObject({ triggers: 4, eligible_rounds: 5 })
  })

  it('not detected when last4 only marginally worse', () => {
    // delta = +0.5 < 1.5 → no trigger
    const rounds = Array.from({ length: 6 }, () =>
      r([...FRONT14_PAR_AVG, 4.5, 4.5, 4.5, 4.5].map(Math.round))
    )
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
  })

  it('skips rounds with <18 valid scores (handled by wrapper, but defensive in detect)', () => {
    const rounds = [
      r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null))),
      r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null))),
      r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null))),
      r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null))),
      r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null))),
    ]
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
  })
})

describe('driving_inconsistency', () => {
  const pattern = PATTERNS.find(p => p.id === 'driving_inconsistency')!

  it('exists with requires18Holes=false and severity=info', () => {
    expect(pattern).toBeDefined()
    expect(pattern.requires18Holes).toBe(false)
    expect(pattern.severity).toBe('info')
  })

  it('not detected with fewer than 5 rounds with valid total_gross', () => {
    const rounds = Array.from({ length: 4 }, (_, i) =>
      r([], { total_gross: 90 + i })
    )
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('not detected when CV is low (consistent scores)', () => {
    // total_gross: 90,91,90,91,90,91,90,91,90,91 — std muy bajo, mean ~90.5
    const rounds = Array.from({ length: 10 }, (_, i) =>
      r([], { total_gross: 90 + (i % 2) })
    )
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
    expect(result.confidence).toBeLessThan(0.6)
  })

  it('detected when CV exceeds 0.06 (high dispersion)', () => {
    // Mean 90, valores oscilan entre 75 y 105 → CV alto
    const totals = [75, 105, 80, 100, 85, 95, 78, 102, 82, 98]
    const rounds = totals.map(t => r([], { total_gross: t }))
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.6)
    expect(result.confidence).toBeLessThanOrEqual(0.95)
    expect(result.metadata).toMatchObject({ sample: 10 })
  })

  it('uses only last 10 rounds when more are provided', () => {
    // 15 rondas: las primeras 5 muy estables, últimas 10 dispersas
    const stable = Array.from({ length: 5 }, () => r([], { total_gross: 90 }))
    const wild = [75, 105, 80, 100, 85, 95, 78, 102, 82, 98].map(t => r([], { total_gross: t }))
    const result = pattern.detect([...stable, ...wild])
    expect(result.detected).toBe(true)
    expect(result.metadata).toMatchObject({ sample: 10 })
  })

  it('ignores rounds with non-numeric total_gross', () => {
    const rounds = [
      ...Array.from({ length: 4 }, () => r([], { total_gross: 90 })),
      r([], { total_gross: 0 }),
    ]
    const result = pattern.detect(rounds)
    expect(result.detected).toBe(false)
  })
})

describe('PATTERNS registry includes the 2 new orphans', () => {
  it('has exactly 9 patterns post-FASE 1A (7 originales + 2 huerfanos)', () => {
    expect(PATTERNS.length).toBe(9)
  })

  it('detectPatterns wrapper applies requires18Holes filter to pressure_deterioration', () => {
    const round9 = r(Array.from({ length: 9 }, () => 4).concat(Array(9).fill(null)))
    const detections = detectPatterns([round9, round9, round9, round9, round9])
    const fired = detections.find(d => d.pattern.id === 'pressure_deterioration')
    expect(fired).toBeUndefined()
  })
})
