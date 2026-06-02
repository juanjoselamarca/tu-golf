import { describe, it, expect } from 'vitest'
import { selectFocus } from '../select-focus'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import { round, spiralRound, multiPatternRound, nineHoleSpiral, NO_TARGET } from './fixtures'

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
    expect(result.deltaVsTarget).toBeCloseTo(6.4) // 18.4 − 12
  })
})

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
    expect(result.metrica.key).toBe('post_bogey_score_avg')
    expect(result.metrica.muestra).toBe(4)
    expect(result.metrica.valor).toBeCloseTo(4.56, 1) // 41/9 por ronda
  })
})

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
    const result = selectFocus({ rounds, weights: [patternW('post_bogey_spiral', 0.8)], target: NO_TARGET })
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

describe('selectFocus — el peso decide el ganador, no sólo la confianza', () => {
  const rounds = [multiPatternRound('m1'), multiPatternRound('m2'), multiPatternRound('m3')]

  it('subir el peso de un patrón de menor confianza lo vuelve el foco elegido', () => {
    const base = selectFocus({ rounds, weights: [], target: NO_TARGET })
    if (base.kind !== 'focus') throw new Error('expected focus')

    const boosted = selectFocus({ rounds, weights: [patternW('first_hole_anxiety', 1.0)], target: NO_TARGET })
    if (boosted.kind !== 'focus') throw new Error('expected focus')

    expect(boosted.patternId).toBe('first_hole_anxiety')
    expect(boosted.peso).toBe(1.0)
    expect(boosted.patternId).not.toBe(base.patternId)
  })
})

describe('selectFocus — gate de muestra (anti-fantasía)', () => {
  it('patrón detectado pero sin métrica medible (9h) → fallback honesto, no foco', () => {
    const rounds = [nineHoleSpiral('n1'), nineHoleSpiral('n2'), nineHoleSpiral('n3')]
    const result = selectFocus({ rounds, weights: [], target: NO_TARGET })
    expect(result.kind).toBe('fallback')
    if (result.kind !== 'fallback') throw new Error('unreachable')
    expect(result.reason).toBe('no_pattern_passed_gate')
  })
})
