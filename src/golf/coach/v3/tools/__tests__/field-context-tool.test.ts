import { describe, it, expect, vi } from 'vitest'
import { fieldContext, type FieldContextDeps } from '../field-context-tool'
import type { RoundData } from '@/golf/coach/metrics'

// Rondas con par 3 jugados peor que la media del bucket (para un valor real).
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

// Media externa verificada interpolada al índice exacto (12): ~3.69 strokes en
// par-3 ⇒ interno 0.69 vs-par. El jugador hace 1.0 (peor que su nivel).
const MEAN_EXTERNAL_AT_12 = 3.69

function makeDeps(over: Partial<FieldContextDeps> = {}): FieldContextDeps {
  return {
    loadIndice: vi.fn(async () => 12), // bucket 10-14
    loadRounds: vi.fn(async () => par3HeavyRounds(6)),
    loadBenchmarkMean: vi.fn(async () => MEAN_EXTERNAL_AT_12),
    loadPopulationBetterThanPct: vi.fn(async () => 64),
    loadRecentCourse: vi.fn(async () => ({ nombre: 'Los Leones', par: 72, slope: 132, course_rating: 73.5 })),
    loadBand: vi.fn(async () => ({ slope: 113, course_rating: 72.0 })),
    ...over,
  }
}

const ctx = { supabase: {} as never, userId: 'u1' }

describe('fieldContext tool', () => {
  it('capa A VIVA con media verificada: delta-vs-promedio, SIN percentil de sub-métrica', async () => {
    const deps = makeDeps()
    const res = await fieldContext(ctx, { metric_key: 'par3_avg_vs_par' }, deps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // La media se pide al índice EXACTO server-side (12), no a un bucket.
    expect(deps.loadBenchmarkMean).toHaveBeenCalledWith('score_par3', 12)
    expect(res.data.vs_handicap.disponible).toBe(true)
    if (res.data.vs_handicap.disponible) {
      expect(res.data.vs_handicap.tu_valor).toBe(1) // par3_avg_vs_par = 1.0
      expect(res.data.vs_handicap.normal_para_tu_handicap).toBe(0.69) // 3.69 - 3
      // CERO FALLOS: una sola media (p50) ⇒ NUNCA un percentil inventado.
      expect(res.data.vs_handicap.mejor_que_pct).toBeNull()
      // El jugador (1.0) está peor que lo normal (0.69) ⇒ margen de mejora.
      expect(res.data.vs_handicap.interpretacion).toMatch(/margen de mejora|por encima/)
    }
    // Las capas verificadas (B población USGA, C dificultad) siguen vivas.
    expect(res.data.ranking_poblacional.disponible).toBe(true)
    expect(res.data.dificultad_cancha.disponible).toBe(true)
    if (res.data.dificultad_cancha.disponible) {
      expect(res.data.dificultad_cancha.relativa).toMatch(/más difícil/)
    }
  })

  it('contextualiza par-4 (métrica de field, no foco) con su propia media verificada', async () => {
    // En par3HeavyRounds los par-4 se juegan a par ⇒ par4_avg_vs_par = 0.
    // Media externa par-4 al índice 12 ≈ 4.69 ⇒ interno 0.69; el jugador (0) está mejor.
    const deps = makeDeps({ loadBenchmarkMean: vi.fn(async () => 4.69) })
    const res = await fieldContext(ctx, { metric_key: 'par4_avg_vs_par' }, deps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(deps.loadBenchmarkMean).toHaveBeenCalledWith('score_par4', 12)
    expect(res.data.vs_handicap.disponible).toBe(true)
    if (res.data.vs_handicap.disponible) {
      expect(res.data.vs_handicap.tu_valor).toBe(0)
      expect(res.data.vs_handicap.normal_para_tu_handicap).toBe(0.69) // 4.69 − 4
      expect(res.data.vs_handicap.mejor_que_pct).toBeNull()
      expect(res.data.vs_handicap.interpretacion).toMatch(/mejor que lo normal/)
    }
  })

  it('capa A degrada honesta si no hay media sembrada para el índice', async () => {
    const deps = makeDeps({ loadBenchmarkMean: vi.fn(async () => null) })
    const res = await fieldContext(ctx, { metric_key: 'par3_avg_vs_par' }, deps)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.vs_handicap.disponible).toBe(false)
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
    expect(deps.loadBenchmarkMean).toHaveBeenCalledWith('score_par3', 12)
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
    // No debe consultar la media si no hay mapping.
    expect(deps.loadBenchmarkMean).not.toHaveBeenCalled()
  })

  it('degrada capa B sin índice (no rompe)', async () => {
    const res = await fieldContext(ctx, { metric_key: 'par3_avg_vs_par' }, makeDeps({ loadIndice: vi.fn(async () => null) }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.ranking_poblacional.disponible).toBe(false)
      expect(res.data.vs_handicap.disponible).toBe(false) // sin índice no hay media
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
