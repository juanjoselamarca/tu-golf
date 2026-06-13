import { describe, it, expect } from 'vitest'
import { validatePattern, DEFAULT_THRESHOLDS, type ObservationPair } from '../pattern-validator'

/** Pares lineales x=1..n, y=f(x). */
const lin = (n: number, f: (x: number) => number): ObservationPair[] =>
  Array.from({ length: n }, (_, i) => ({ x: i + 1, y: f(i + 1) }))

describe('validatePattern — filtro anti-fantasía (Cohen d signado + R² OLS, gates AND)', () => {
  it('patrón REAL fuerte (y=x, N=20) → válido, passed', () => {
    const v = validatePattern(lin(20, (x) => x))
    expect(v.valido).toBe(true)
    expect(v.razon).toBe('passed')
    expect(v.n).toBe(20)
    expect(v.effectSize).toBeCloseTo(3.303, 2)
    expect(v.r2).toBeCloseTo(1, 5)
    expect(v.meanDeltaStrokes).toBeCloseTo(10, 5)
    expect(v.pValue).not.toBeNull()
    expect(v.pValue!).toBeLessThan(0.05)
  })

  it('N insuficiente (9 pares, correlación perfecta) → insufficient_n, NO válido', () => {
    const v = validatePattern(lin(9, (x) => x))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('insufficient_n')
    expect(v.n).toBe(9)
  })

  it('efecto chico (d<0.3, r>0) → effect_too_small', () => {
    const v = validatePattern(lin(20, (x) => 0.1 * x + ((x - 1) % 2 ? 4 : -4)))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('effect_too_small')
    expect(v.effectSize!).toBeCloseTo(0.2337, 3)
  })

  it('d alto pero R² bajo (gates son AND) → r2_too_low', () => {
    const t4: ObservationPair[] = [
      ...[8, 9, 10, 11, 12, 9, 10, 11].map((y) => ({ x: 1, y })),
      ...[18, 5, 30, 2, 25, 4, 28, 3].map((y) => ({ x: 2, y })),
    ]
    const v = validatePattern(t4)
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('r2_too_low')
    expect(v.effectSize!).toBeGreaterThanOrEqual(0.3) // d sí pasa
    expect(v.r2!).toBeLessThan(0.15) // R² no
  })

  it('dirección invertida (y=21-x) → wrong_direction aunque |d| y R² sean enormes', () => {
    const v = validatePattern(lin(20, (x) => 21 - x))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('wrong_direction')
    expect(v.effectSize!).toBeLessThan(0)
  })

  it('serie vacía → serie_vacia con campos null', () => {
    const v = validatePattern([])
    expect(v).toMatchObject({ valido: false, razon: 'serie_vacia', n: 0, effectSize: null, r2: null, pValue: null })
  })

  it('degenerada: todos los x iguales → degenerate_split (un grupo vacío)', () => {
    const v = validatePattern(Array.from({ length: 16 }, (_, i) => ({ x: 5, y: i + 1 })))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('degenerate_split')
  })

  it('degenerada: todos los y iguales → degenerate_variance (s_pooled=0)', () => {
    const v = validatePattern(lin(16, () => 7))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('degenerate_variance')
  })

  it('degenerada: mayoría de x en la mediana → degenerate_split', () => {
    const v = validatePattern([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1, 9].map((x, i) => ({ x, y: i + 1 })))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('degenerate_split')
  })

  it('N=14 con correlación perfecta → insufficient_n (boundary −1)', () => {
    const v = validatePattern(lin(14, (x) => x))
    expect(v.valido).toBe(false)
    expect(v.razon).toBe('insufficient_n')
    expect(v.n).toBe(14)
  })

  it('N=15 con correlación perfecta → passed (boundary exacto)', () => {
    const v = validatePattern(lin(15, (x) => x))
    expect(v.valido).toBe(true)
    expect(v.razon).toBe('passed')
    expect(v.n).toBe(15)
  })

  it('umbral inyectable: y=x con 6 pares es insuficiente por default pero pasa con minN=5', () => {
    const data = lin(6, (x) => x)
    expect(validatePattern(data).razon).toBe('insufficient_n')
    const v = validatePattern(data, { ...DEFAULT_THRESHOLDS, minN: 5 })
    expect(v.valido).toBe(true)
    expect(v.razon).toBe('passed')
  })

  it('empates en la mediana van a L de forma determinista (snapshot effectSize)', () => {
    const tie: ObservationPair[] = [
      { x: 1, y: 10 }, { x: 2, y: 11 }, { x: 3, y: 12 }, { x: 3, y: 13 }, { x: 3, y: 9 },
      { x: 3, y: 8 }, { x: 5, y: 20 }, { x: 6, y: 22 }, { x: 7, y: 25 }, { x: 8, y: 28 },
      { x: 9, y: 30 }, { x: 10, y: 32 }, { x: 4, y: 15 }, { x: 4, y: 14 }, { x: 11, y: 35 },
      { x: 12, y: 38 },
    ]
    const v = validatePattern(tie)
    expect(v.valido).toBe(true)
    expect(v.razon).toBe('passed')
    expect(v.effectSize).not.toBeNull()
    expect(v.effectSize!).toBeGreaterThan(0.3)
  })

  it('TOTALIDAD: 50 datasets variados → siempre veredicto bien formado, sin NaN/Infinity', () => {
    for (let s = 0; s < 50; s++) {
      const n = 3 + (s % 25) // 3..27
      const slope = ((s % 7) - 3) // -3..3
      const noiseAmp = (s % 5) * 2
      const data = Array.from({ length: n }, (_, i) => ({
        x: i + 1,
        y: slope * (i + 1) + (i % 2 ? noiseAmp : -noiseAmp) + (s % 3),
      }))
      const v = validatePattern(data)
      for (const f of [v.effectSize, v.r2, v.pValue, v.meanDeltaStrokes]) {
        if (f !== null) expect(Number.isFinite(f)).toBe(true)
      }
      expect(typeof v.valido).toBe('boolean')
      expect(v.valido).toBe(v.razon === 'passed')
    }
  })
})
