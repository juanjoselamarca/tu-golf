import { describe, it, expect, vi } from 'vitest'
import { fieldContext, type FieldContextDeps } from '../field-context-tool'
import type { RoundData } from '@/golf/coach/metrics'

// Rondas con par 3 jugados peor que la mediana del bucket (para un valor real).
function par3HeavyRounds(n: number): RoundData[] {
  // 18 hoyos: par estándar con 4 par-3 (hoyos 3,6,11,16). Score = par+1 en los par-3.
  const pars = [4, 4, 3, 4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4]
  const scores = pars.map((p) => (p === 3 ? p + 1 : p)) // +1 en cada par 3 ⇒ par3_avg_vs_par = 1.0
  const rounds: RoundData[] = []
  for (let i = 0; i < n; i++) {
    rounds.push({
      id: `r${i}`,
      scores,
      total_gross: scores.reduce((a, b) => a + b, 0),
      par_per_hole: Object.fromEntries(pars.map((p, idx) => [String(idx + 1), p])),
      played_at: `2026-0${(i % 9) + 1}-01`,
      metadata: { holes_played: 18 },
    } as RoundData)
  }
  return rounds
}

const BENCH_EXTERNAL = [
  { percentile: 10, value: 3.2 },
  { percentile: 25, value: 3.4 },
  { percentile: 50, value: 3.6 },
  { percentile: 75, value: 3.9 },
  { percentile: 90, value: 4.2 },
]

function makeDeps(over: Partial<FieldContextDeps> = {}): FieldContextDeps {
  return {
    loadIndice: vi.fn(async () => 12), // bucket 10-14
    loadRounds: vi.fn(async () => par3HeavyRounds(6)),
    loadBenchmark: vi.fn(async () => BENCH_EXTERNAL),
    loadPopulationBetterThanPct: vi.fn(async () => 64),
    loadRecentCourse: vi.fn(async () => ({ nombre: 'Los Leones', par: 72, slope: 132, course_rating: 73.5 })),
    loadBand: vi.fn(async () => ({ slope: 113, course_rating: 72.0 })),
    ...over,
  }
}

const ctx = { supabase: {} as never, userId: 'u1' }

describe('fieldContext tool', () => {
  it('devuelve las 3 capas con data real', async () => {
    const res = await fieldContext(ctx, { metric_key: 'par3_avg_vs_par' }, makeDeps())
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.vs_handicap.disponible).toBe(true)
    expect(res.data.ranking_poblacional.disponible).toBe(true)
    expect(res.data.dificultad_cancha.disponible).toBe(true)
    if (res.data.vs_handicap.disponible) {
      // par3_avg_vs_par del jugador = 1.0; benchmark interno: p50=0.6, p90=1.2
      expect(res.data.vs_handicap.tu_valor).toBeCloseTo(1.0, 1)
      expect(res.data.vs_handicap.normal_para_tu_handicap).toBe(0.6)
      // 1.0 está entre p75(0.9) y p90(1.2) ⇒ mejor que poca gente
      expect(res.data.vs_handicap.mejor_que_pct!).toBeLessThan(25)
    }
  })

  it('IGNORA un handicap pasado por el LLM: usa el índice server-side', async () => {
    const deps = makeDeps()
    const res = await fieldContext(
      ctx,
      // El LLM intenta colar handicap=2 (scratch). Debe ignorarse: input no lo expone.
      { metric_key: 'par3_avg_vs_par', handicap: 2, indice: 2, percentil: 99 },
      deps,
    )
    expect(res.ok).toBe(true)
    // El índice salió de loadIndice (server-side), nunca del input.
    expect(deps.loadIndice).toHaveBeenCalledWith('u1')
    if (res.ok && res.data.ranking_poblacional.disponible) {
      expect(res.data.ranking_poblacional.indice).toBe(12)
    }
  })

  it('degrada capa A cuando la métrica no tiene benchmark mapeado', async () => {
    const deps = makeDeps()
    const res = await fieldContext(ctx, { metric_key: 'total_gross_cv' }, deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.vs_handicap.disponible).toBe(false)
      // Las otras capas siguen vivas.
      expect(res.data.ranking_poblacional.disponible).toBe(true)
      expect(res.data.dificultad_cancha.disponible).toBe(true)
    }
    // No debe consultar el benchmark si no hay mapping.
    expect(deps.loadBenchmark).not.toHaveBeenCalled()
  })

  it('degrada capa B sin índice (no rompe)', async () => {
    const res = await fieldContext(ctx, { metric_key: 'par3_avg_vs_par' }, makeDeps({ loadIndice: vi.fn(async () => null) }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.ranking_poblacional.disponible).toBe(false)
      expect(res.data.vs_handicap.disponible).toBe(false) // sin índice no hay bucket
    }
  })

  it('degrada capa C sin cancha reciente', async () => {
    const res = await fieldContext(
      ctx,
      { metric_key: 'par3_avg_vs_par' },
      makeDeps({ loadRecentCourse: vi.fn(async () => null) }),
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.dificultad_cancha.disponible).toBe(false)
  })

  it('sin metric_key igual da ranking + dificultad', async () => {
    const res = await fieldContext(ctx, {}, makeDeps())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.vs_handicap.disponible).toBe(false)
      expect(res.data.ranking_poblacional.disponible).toBe(true)
      expect(res.data.dificultad_cancha.disponible).toBe(true)
    }
  })
})
