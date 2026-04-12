import { describe, it, expect } from 'vitest'
import { calcularCPI, validarRonda, nivelCPI, type RondaCPI } from '../golf/stats/cpi'
import type { ImportRoundData } from '@/lib/import-types'

function makeRonda(playedAt: string, gross: number, cr = 72, slope = 113): RondaCPI {
  return { played_at: playedAt, total_gross: gross, course_rating: cr, slope_rating: slope }
}

function makeImportRound(scores: Record<string, number>, total?: number): ImportRoundData {
  const sum = Object.values(scores).reduce((a, b) => a + b, 0)
  return {
    tempId: 't1',
    played_at: '2026-04-01',
    course_name: 'Test Course',
    total_gross: total ?? sum,
    holes_played: Object.keys(scores).length === 9 ? 9 : 18,
    scores,
    import_confidence: 1,
    validation: { valid: true, holesPlayed: Object.keys(scores).length, issues: [] },
  }
}

describe('CPI — nivelCPI', () => {
  it('classifies elite range', () => {
    expect(nivelCPI(95)).toBe('Elite')
    expect(nivelCPI(90)).toBe('Elite')
  })

  it('classifies advanced range', () => {
    expect(nivelCPI(75)).toBe('Avanzado')
    expect(nivelCPI(89)).toBe('Avanzado')
  })

  it('classifies intermediate range', () => {
    expect(nivelCPI(55)).toBe('Intermedio')
    expect(nivelCPI(74)).toBe('Intermedio')
  })

  it('classifies developing range', () => {
    expect(nivelCPI(35)).toBe('En desarrollo')
    expect(nivelCPI(54)).toBe('En desarrollo')
  })

  it('classifies beginner range', () => {
    expect(nivelCPI(15)).toBe('Principiante')
    expect(nivelCPI(34)).toBe('Principiante')
  })

  it('classifies unclassified', () => {
    expect(nivelCPI(0)).toBe('Sin clasificar')
    expect(nivelCPI(14)).toBe('Sin clasificar')
  })
})

describe('CPI — calcularCPI insufficient data', () => {
  it('returns insufficient_data with 0 rondas', () => {
    const r = calcularCPI([])
    expect(r.status).toBe('insufficient_data')
    expect(r.score).toBe(0)
    expect(r.rondas_usadas).toBe(0)
  })

  it('returns insufficient_data with 2 rondas', () => {
    const r = calcularCPI([makeRonda('2026-01-01', 90), makeRonda('2026-02-01', 91)])
    expect(r.status).toBe('insufficient_data')
  })

  it('filters out invalid rounds (gross <= 0)', () => {
    const r = calcularCPI([
      makeRonda('2026-01-01', 90),
      makeRonda('2026-02-01', 0),
      makeRonda('2026-03-01', 91),
    ])
    expect(r.rondas_usadas).toBe(2)
    expect(r.status).toBe('insufficient_data')
  })
})

describe('CPI — calcularCPI provisional vs established', () => {
  it('3-9 rondas → provisional', () => {
    const rondas = Array.from({ length: 5 }, (_, i) =>
      makeRonda(`2026-0${i + 1}-01`, 85)
    )
    const r = calcularCPI(rondas)
    expect(r.status).toBe('provisional')
    expect(r.rondas_usadas).toBe(5)
  })

  it('10+ rondas → established', () => {
    const rondas = Array.from({ length: 10 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 85)
    )
    const r = calcularCPI(rondas)
    expect(r.status).toBe('established')
  })

  it('caps at 20 rondas (uses most recent)', () => {
    const rondas = Array.from({ length: 30 }, (_, i) =>
      makeRonda(`2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, 85)
    )
    const r = calcularCPI(rondas)
    expect(r.rondas_usadas).toBe(20)
  })
})

describe('CPI — calcularCPI scoring', () => {
  it('scratch player (par 72) gets high score', () => {
    const rondas = Array.from({ length: 12 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 72, 72, 113)
    )
    const r = calcularCPI(rondas)
    expect(r.score).toBeGreaterThan(70)
  })

  it('high handicap player (108) gets lower score than scratch', () => {
    const high = calcularCPI(Array.from({ length: 12 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 108, 72, 113)
    ))
    const scratch = calcularCPI(Array.from({ length: 12 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 72, 72, 113)
    ))
    expect(scratch.score).toBeGreaterThan(high.score)
  })

  it('consistent scores → high consistencia component', () => {
    const consistent = calcularCPI(Array.from({ length: 10 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 80)
    ))
    const inconsistent = calcularCPI([
      makeRonda('2026-01-01', 70), makeRonda('2026-02-01', 110),
      makeRonda('2026-03-01', 75), makeRonda('2026-04-01', 105),
      makeRonda('2026-05-01', 80), makeRonda('2026-06-01', 95),
      makeRonda('2026-07-01', 72), makeRonda('2026-08-01', 100),
      makeRonda('2026-09-01', 78), makeRonda('2026-10-01', 102),
    ])
    expect(consistent.breakdown.consistencia).toBeGreaterThan(inconsistent.breakdown.consistencia)
  })

  it('improving player → positive trend', () => {
    // More recent rondas have lower scores (improving)
    const rondas = [
      makeRonda('2026-10-01', 78),
      makeRonda('2026-09-01', 80),
      makeRonda('2026-08-01', 82),
      makeRonda('2026-07-01', 84),
      makeRonda('2026-06-01', 86),
      makeRonda('2026-05-01', 88),
      makeRonda('2026-04-01', 90),
      makeRonda('2026-03-01', 92),
      makeRonda('2026-02-01', 94),
      makeRonda('2026-01-01', 96),
    ]
    const r = calcularCPI(rondas)
    expect(r.trend).toBeGreaterThan(0)
  })

  it('declining player → negative trend', () => {
    const rondas = [
      makeRonda('2026-10-01', 96),
      makeRonda('2026-09-01', 94),
      makeRonda('2026-08-01', 92),
      makeRonda('2026-07-01', 90),
      makeRonda('2026-06-01', 88),
      makeRonda('2026-05-01', 86),
      makeRonda('2026-04-01', 84),
      makeRonda('2026-03-01', 82),
      makeRonda('2026-02-01', 80),
      makeRonda('2026-01-01', 78),
    ]
    const r = calcularCPI(rondas)
    expect(r.trend).toBeLessThan(0)
  })

  it('uses default course_rating/slope when null', () => {
    const r = calcularCPI(Array.from({ length: 10 }, (_, i) =>
      ({ played_at: `2026-${String(i + 1).padStart(2, '0')}-01`, total_gross: 80, course_rating: null, slope_rating: null })
    ))
    expect(r.status).toBe('established')
    expect(r.score).toBeGreaterThan(0)
  })

  it('score is always in [0, 100]', () => {
    for (const gross of [60, 72, 85, 100, 130]) {
      const r = calcularCPI(Array.from({ length: 10 }, (_, i) =>
        makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, gross)
      ))
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
  })

  it('volumen_factor is 1.0 with 10+ rondas', () => {
    const r = calcularCPI(Array.from({ length: 12 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 85)
    ))
    expect(r.breakdown.volumen_factor).toBe(1)
  })

  it('volumen_factor < 1 with fewer than 10 rondas', () => {
    const r = calcularCPI(Array.from({ length: 5 }, (_, i) =>
      makeRonda(`2026-${String(i + 1).padStart(2, '0')}-01`, 85)
    ))
    expect(r.breakdown.volumen_factor).toBeLessThan(1)
    expect(r.breakdown.volumen_factor).toBe(0.5)
  })
})

describe('CPI — validarRonda', () => {
  it('valid 18-hole round passes', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) scores[String(i)] = 5
    const result = validarRonda(makeImportRound(scores))
    expect(result.valid).toBe(true)
    expect(result.holesPlayed).toBe(18)
    expect(result.issues).toHaveLength(0)
  })

  it('valid 9-hole round passes', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) scores[String(i)] = 4
    const result = validarRonda(makeImportRound(scores))
    expect(result.valid).toBe(true)
    expect(result.holesPlayed).toBe(9)
  })

  it('detects incomplete round (12 holes)', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 12; i++) scores[String(i)] = 5
    const result = validarRonda(makeImportRound(scores))
    expect(result.holesPlayed).toBe(12)
    expect(result.issues.some(i => i.type === 'incomplete_round')).toBe(true)
  })

  it('detects missing scores (zero)', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) scores[String(i)] = i === 5 ? 0 : 5
    const result = validarRonda(makeImportRound(scores))
    const missing = result.issues.find(i => i.type === 'missing_score')
    expect(missing).toBeDefined()
    expect(missing!.holeNumber).toBe(5)
    expect(missing!.canFix).toBe(true)
  })

  it('detects scores out of range (>20)', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) scores[String(i)] = i === 7 ? 25 : 5
    const result = validarRonda(makeImportRound(scores))
    const oor = result.issues.find(i => i.type === 'score_out_of_range')
    expect(oor).toBeDefined()
    expect(oor!.holeNumber).toBe(7)
  })

  it('detects total mismatch', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) scores[String(i)] = 5
    const round = makeImportRound(scores, 100) // Wrong total: actual sum is 90
    const result = validarRonda(round)
    expect(result.issues.some(i => i.message.includes('no coincide'))).toBe(true)
  })

  it('allows total within ±1 of sum', () => {
    const scores: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) scores[String(i)] = 5
    const round = makeImportRound(scores, 91) // sum is 90, within ±1
    const result = validarRonda(round)
    const mismatchIssue = result.issues.find(i => i.message.includes('no coincide'))
    expect(mismatchIssue).toBeUndefined()
  })
})
