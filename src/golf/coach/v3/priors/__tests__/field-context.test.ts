import { describe, it, expect } from 'vitest'
import {
  betterThanPct,
  classifyVsNormal,
  classifyCourseDifficulty,
  buildFieldContext,
  type BuildFieldContextInput,
} from '../field-context'

// Benchmark interno típico de par3_avg_vs_par (strokes sobre par en par 3),
// menos es mejor: p10=0.2 (muy bueno) … p90=1.2 (flojo).
const BENCH = [
  { percentile: 10, value: 0.2 },
  { percentile: 25, value: 0.4 },
  { percentile: 50, value: 0.6 },
  { percentile: 75, value: 0.9 },
  { percentile: 90, value: 1.2 },
]

describe('betterThanPct', () => {
  it('valor en la mediana ⇒ ~50% (lower is better)', () => {
    expect(betterThanPct(BENCH, 0.6, true)).toBe(50)
  })
  it('valor muy bajo (mejor que casi todos) ⇒ saturación honesta en el extremo', () => {
    // 0.2 = p10 ⇒ mejor que 90%
    expect(betterThanPct(BENCH, 0.2, true)).toBe(90)
    // por debajo del p10 conocido: satura en 90 (no inventa 100)
    expect(betterThanPct(BENCH, 0.05, true)).toBe(90)
  })
  it('valor alto (peor) ⇒ mejor que pocos', () => {
    // 1.2 = p90 ⇒ mejor que 10%
    expect(betterThanPct(BENCH, 1.2, true)).toBe(10)
  })
  it('interpola entre percentiles', () => {
    // 0.5 está entre p25(0.4) y p50(0.6) → pBelow≈37.5 → mejor que ~62%
    expect(betterThanPct(BENCH, 0.5, true)).toBe(63)
  })
  it('higher-is-better invierte la dirección', () => {
    // mismo punto en la mediana sigue ~50
    expect(betterThanPct(BENCH, 0.6, false)).toBe(50)
    // valor alto con higher-is-better ⇒ mejor que muchos
    expect(betterThanPct(BENCH, 1.2, false)).toBe(90)
  })
  it('menos de 2 puntos ⇒ null (no se puede interpolar)', () => {
    expect(betterThanPct([{ percentile: 50, value: 0.6 }], 0.5, true)).toBeNull()
    expect(betterThanPct([], 0.5, true)).toBeNull()
  })
})

describe('classifyVsNormal', () => {
  it('dentro de la tolerancia ⇒ "en línea"', () => {
    expect(classifyVsNormal(0.62, 0.6, true, 0.1)).toMatch(/en línea/)
  })
  it('por debajo (mejor, lower is better)', () => {
    expect(classifyVsNormal(0.3, 0.6, true, 0.05)).toMatch(/mejor que lo normal/)
  })
  it('por encima (peor, lower is better)', () => {
    expect(classifyVsNormal(1.0, 0.6, true, 0.05)).toMatch(/margen de mejora/)
  })
})

describe('classifyCourseDifficulty', () => {
  it('slope bastante mayor ⇒ más difícil', () => {
    expect(classifyCourseDifficulty(135, 113)).toMatch(/más difícil/)
  })
  it('slope bastante menor ⇒ más fácil', () => {
    expect(classifyCourseDifficulty(100, 113)).toMatch(/más fácil/)
  })
  it('slope similar ⇒ dificultad similar', () => {
    expect(classifyCourseDifficulty(115, 113)).toMatch(/similar/)
  })
  it('sin banda ⇒ degrada honesto', () => {
    expect(classifyCourseDifficulty(120, null)).toMatch(/sin banda de referencia/)
  })
})

describe('buildFieldContext', () => {
  const base: BuildFieldContextInput = {
    metricLabel: 'Debilidad en par 3',
    playerValue: 0.9,
    benchmarkInternal: BENCH,
    lowerIsBetter: true,
    indice: 12,
    populationBetterThanPct: 64,
    course: { nombre: 'Los Leones', par: 72, slope: 132, course_rating: 73.5 },
    band: { slope: 113, course_rating: 72.0 },
  }

  it('compone las 3 capas cuando hay data', () => {
    const r = buildFieldContext(base)
    expect(r.vs_handicap.disponible).toBe(true)
    expect(r.ranking_poblacional.disponible).toBe(true)
    expect(r.dificultad_cancha.disponible).toBe(true)
    if (r.vs_handicap.disponible) {
      expect(r.vs_handicap.normal_para_tu_handicap).toBe(0.6)
      expect(r.vs_handicap.mejor_que_pct).toBe(25) // 0.9 = p75 ⇒ mejor que 25%
    }
    if (r.ranking_poblacional.disponible) {
      expect(r.ranking_poblacional.mejor_que_pct).toBe(64)
    }
    if (r.dificultad_cancha.disponible) {
      expect(r.dificultad_cancha.relativa).toMatch(/más difícil/)
    }
  })

  it('degrada capa A sin valor del jugador, sin romper las otras', () => {
    const r = buildFieldContext({ ...base, playerValue: null })
    expect(r.vs_handicap.disponible).toBe(false)
    expect(r.ranking_poblacional.disponible).toBe(true)
    expect(r.dificultad_cancha.disponible).toBe(true)
  })

  it('degrada capa B sin índice', () => {
    const r = buildFieldContext({ ...base, indice: null, populationBetterThanPct: null })
    expect(r.ranking_poblacional.disponible).toBe(false)
  })

  it('degrada capa C sin cancha', () => {
    const r = buildFieldContext({ ...base, course: null })
    expect(r.dificultad_cancha.disponible).toBe(false)
  })

  it('degrada capa A sin benchmark (no hay mediana)', () => {
    const r = buildFieldContext({ ...base, benchmarkInternal: [] })
    expect(r.vs_handicap.disponible).toBe(false)
  })
})
