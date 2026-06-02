import { describe, it, expect } from 'vitest'
import { selectFocus } from '../select-focus'
import type { SelectFocusInput } from '../types'
import type { RoundData } from '@/golf/coach/metrics'

/**
 * Builder de rondas sintéticas. `scores` = 18 (o 9) números; par estándar 72.
 * Permite forzar patrones específicos para validar el gate y el rankeo.
 */
function round(
  id: string,
  scores: (number | null)[],
  opts: { playedAt?: string; pars?: number[]; totalGross?: number; metadata?: Record<string, unknown> } = {},
): RoundData {
  const pars = opts.pars ?? [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
  const parObj: Record<string, number> = {}
  pars.forEach((p, i) => (parObj[String(i + 1)] = p))
  const gross =
    opts.totalGross ??
    scores.reduce<number>((a, s) => a + (typeof s === 'number' ? s : 0), 0)
  return {
    id,
    scores,
    total_gross: gross,
    par_per_hole: parObj,
    played_at: opts.playedAt ?? '2026-05-01T12:00:00Z',
    metadata: opts.metadata ?? null,
  }
}

const NO_TARGET: SelectFocusInput['target'] = {
  currentHandicap: null,
  targetHandicap: null,
  targetDeadline: null,
}

describe('selectFocus — cold start', () => {
  it('sin rondas devuelve fallback honesto (cold_start), nunca un foco inventado', () => {
    const result = selectFocus({ rounds: [], weights: [], target: NO_TARGET })
    expect(result.kind).toBe('fallback')
    if (result.kind !== 'fallback') throw new Error('unreachable')
    expect(result.reason).toBe('cold_start')
    expect(result.deltaVsTarget).toBeNull()
  })

  it('cold_start propaga el handicap actual si lo conoce (para el mensaje honesto)', () => {
    const result = selectFocus({
      rounds: [],
      weights: [],
      target: { currentHandicap: 18.4, targetHandicap: 12, targetDeadline: '2026-12-31' },
    })
    expect(result.kind).toBe('fallback')
    if (result.kind !== 'fallback') throw new Error('unreachable')
    expect(result.handicap).toBe(18.4)
    // delta = current - target = 18.4 - 12 = 6.4 (cuántos puntos arriba del objetivo)
    expect(result.deltaVsTarget).toBeCloseTo(6.4)
  })
})

/**
 * Patrón [B,B,P,P] repetido: bogeys en pares (dispara espiral post-bogey) pero
 * repartidos parejo front/back (NO dispara collapse) y sin tocar par3/hoyo1/cierre.
 * Aísla post_bogey_spiral como único patrón detectable.
 */
const STD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
function spiralRound(id: string): RoundData {
  const scores = STD_PARS.map((par, i) => (i % 4 < 2 ? par + 1 : par))
  return round(id, scores)
}

describe('selectFocus — foco claro (post-bogey spiral aislado)', () => {
  const rounds = [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')]

  it('elige post_bogey_spiral cuando es el único patrón que pasa el gate', () => {
    const result = selectFocus({ rounds, weights: [], target: NO_TARGET })
    expect(result.kind).toBe('focus')
    if (result.kind !== 'focus') throw new Error('unreachable')
    expect(result.patternId).toBe('post_bogey_spiral')
    expect(result.metricKey).toBe('post_bogey_score_avg')
    expect(result.confianza).toBeGreaterThan(0.4)
    expect(result.impacto).toBeGreaterThan(0)
    expect(result.evidencia).toHaveProperty('spiral_rate')
  })

  it('reporta la métrica baseline (escala PLAN_METRIC) vía golf/coach/metrics', () => {
    const result = selectFocus({ rounds, weights: [], target: NO_TARGET })
    if (result.kind !== 'focus') throw new Error('expected focus')
    // computePostBogeyAvg por ronda = 41/9 ≈ 4.56; agregado de 4 rondas idénticas = mismo.
    expect(result.metrica.key).toBe('post_bogey_score_avg')
    expect(result.metrica.muestra).toBe(4)
    expect(result.metrica.valor).toBeCloseTo(4.56, 1)
  })
})

import type { CerebroWeight } from '@/lib/cerebro/weights'

function patternW(key: string, weight: number): CerebroWeight {
  return {
    id: `w-${key}`,
    parameter_type: 'pattern',
    parameter_key: key,
    current_weight: weight,
    previous_weight: null,
    user_cluster_id: null,
    source: 'manual',
    version: 1,
    locked_until: null,
    last_auto_update_at: null,
    last_manual_override_at: null,
    updated_at: '2026-06-02T00:00:00Z',
  }
}

describe('selectFocus — paramétrico vivo (cerebro_weights mueve el rankeo)', () => {
  const rounds = [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')]

  it('el peso del patrón escala el impacto (impacto = confianza × peso)', () => {
    const result = selectFocus({
      rounds,
      weights: [patternW('post_bogey_spiral', 0.8)],
      target: NO_TARGET,
    })
    if (result.kind !== 'focus') throw new Error('expected focus')
    expect(result.peso).toBe(0.8)
    expect(result.impacto).toBeCloseTo(result.confianza * 0.8, 5)
  })

  it('sin override usa el peso por defecto (0.5)', () => {
    const result = selectFocus({ rounds, weights: [], target: NO_TARGET })
    if (result.kind !== 'focus') throw new Error('expected focus')
    expect(result.peso).toBe(0.5)
  })
})

/**
 * Ronda que dispara VARIOS patrones (par3 + arranque lento + hoyo 1) para probar
 * que el peso —no sólo la confianza— decide el ganador.
 */
function multiPatternRound(id: string): RoundData {
  const scores = STD_PARS.map((par, i) => {
    if (i === 0) return par + 3 // hoyo 1 desastroso
    if (par === 3) return par + 2 // par 3 flojos
    return par
  })
  return round(id, scores)
}

describe('selectFocus — el peso decide el ganador, no sólo la confianza', () => {
  const rounds = [multiPatternRound('m1'), multiPatternRound('m2'), multiPatternRound('m3')]

  it('subir el peso de un patrón de menor confianza lo vuelve el foco elegido', () => {
    const base = selectFocus({ rounds, weights: [], target: NO_TARGET })
    if (base.kind !== 'focus') throw new Error('expected focus')

    const boosted = selectFocus({
      rounds,
      weights: [patternW('first_hole_anxiety', 1.0)],
      target: NO_TARGET,
    })
    if (boosted.kind !== 'focus') throw new Error('expected focus')

    expect(boosted.patternId).toBe('first_hole_anxiety')
    expect(boosted.peso).toBe(1.0)
    // El boost cambió el ganador → el rankeo lo mueve el peso vivo, no la decoración.
    expect(boosted.patternId).not.toBe(base.patternId)
  })
})

/**
 * Rondas de 9 hoyos: el detect de post_bogey dispara (requires18Holes=false) pero
 * la métrica PLAN (computePostBogeyAvg) exige 18 hoyos → muestra 0 → gate excluye.
 * Nunca se propone un foco que no se puede medir en la escala del plan.
 */
function nineHoleSpiral(id: string): RoundData {
  const pars9 = STD_PARS.slice(0, 9)
  const scores = pars9.map((par, i) => (i % 4 < 2 ? par + 1 : par))
  return round(id, scores, { pars: pars9 })
}

describe('selectFocus — gate de muestra (anti-fantasía)', () => {
  it('patrón detectado pero sin métrica medible (9h) → fallback honesto, no foco', () => {
    const rounds = [nineHoleSpiral('n1'), nineHoleSpiral('n2'), nineHoleSpiral('n3')]
    const result = selectFocus({ rounds, weights: [], target: NO_TARGET })
    expect(result.kind).toBe('fallback')
    if (result.kind !== 'fallback') throw new Error('unreachable')
    expect(result.reason).toBe('no_pattern_passed_gate')
  })
})

export { round, spiralRound, multiPatternRound, NO_TARGET }
