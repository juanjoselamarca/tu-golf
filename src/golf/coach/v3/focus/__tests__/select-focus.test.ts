import { describe, it, expect } from 'vitest'
import { selectFocus, patternWeight, DEFAULT_PATTERN_WEIGHT } from '../select-focus'
import { FOCUS_CATALOG } from '../catalog'
import type { PatternVerdict } from '../../pattern-validator'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import { round, spiralRound, multiPatternRound, nineHoleSpiral, shortGameRound, NO_TARGET } from './fixtures'

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

describe('selectFocus — short_game_weakness es seleccionable (regresión C2)', () => {
  // Antes el catálogo pedía par4_count a la metadata del detect, que no lo emitía
  // → muestra 0 → el patrón quedaba muerto. patterns.ts ahora emite par4_count.
  const rounds = [shortGameRound('s1'), shortGameRound('s2'), shortGameRound('s3')]

  it('con su peso alto, el foco elegido es short_game_weakness (muestra > 0)', () => {
    const result = selectFocus({
      rounds,
      weights: [patternW('short_game_weakness', 1.0)],
      target: NO_TARGET,
    })
    expect(result.kind).toBe('focus')
    if (result.kind !== 'focus') throw new Error('unreachable')
    expect(result.patternId).toBe('short_game_weakness')
    expect(result.metrica.muestra).toBeGreaterThan(0)
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

const verdict = (over: Partial<PatternVerdict>): PatternVerdict => ({
  valido: false, n: 30, effectSize: 0.1, r2: 0.05, pValue: 0.4, meanDeltaStrokes: 0.5, razon: 'r2_too_low', ...over,
})

describe('selectFocus — gate del validador anti-fantasía (Ola 3 chunk 2)', () => {
  const rounds = [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')]

  it('REGRESIÓN: sin validation el comportamiento no cambia (elige post_bogey_spiral)', () => {
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET })
    expect(r.kind).toBe('focus')
    if (r.kind === 'focus') expect(r.patternId).toBe('post_bogey_spiral')
  })

  it('veredicto concluyente negativo (r2_too_low) EXCLUYE un patrón seed aunque el detect dispare', () => {
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET, validation: { post_bogey_spiral: verdict({ razon: 'r2_too_low' }) } })
    expect(r.kind).toBe('fallback')
    if (r.kind === 'fallback') expect(r.reason).toBe('no_pattern_passed_gate')
  })

  it('insufficient_n NO castiga a un patrón seed (no regresión Ola 2)', () => {
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET, validation: { post_bogey_spiral: verdict({ razon: 'insufficient_n', effectSize: null, r2: null }) } })
    expect(r.kind).toBe('focus')
    if (r.kind === 'focus') expect(r.patternId).toBe('post_bogey_spiral')
  })

  it('veredicto válido adjunta la evidencia (validacion) al foco', () => {
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET, validation: { post_bogey_spiral: { valido: true, n: 40, effectSize: 0.6, r2: 0.3, pValue: 0.001, meanDeltaStrokes: 2.3, razon: 'passed' } } })
    expect(r.kind).toBe('focus')
    if (r.kind === 'focus') expect(r.validacion).toMatchObject({ n: 40, r2: 0.3, meanDeltaStrokes: 2.3 })
  })

  it('un candidato NO-seed (discovered) sin veredicto NUNCA es foco', () => {
    const discovered = FOCUS_CATALOG.filter((c) => c.patternId === 'post_bogey_spiral').map((c) => ({ ...c, source: 'discovered' }))
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET, catalog: discovered })
    expect(r.kind).toBe('fallback')
  })

  it('el mismo discovered CON veredicto válido sí es foco', () => {
    const discovered = FOCUS_CATALOG.filter((c) => c.patternId === 'post_bogey_spiral').map((c) => ({ ...c, source: 'discovered' }))
    const r = selectFocus({ rounds, weights: [], target: NO_TARGET, catalog: discovered, validation: { post_bogey_spiral: { valido: true, n: 40, effectSize: 0.6, r2: 0.3, pValue: 0.001, meanDeltaStrokes: 2.3, razon: 'passed' } } })
    expect(r.kind).toBe('focus')
  })
})

describe('patternWeight — 3 niveles (cerebro_weights → defaultWeight → DEFAULT)', () => {
  it('usa defaultWeight cuando no hay override en cerebro_weights', () => {
    expect(patternWeight([], 'x', 0.7)).toBe(0.7)
  })
  it('cerebro_weights gana sobre defaultWeight', () => {
    expect(patternWeight([patternW('x', 0.9)], 'x', 0.2)).toBe(0.9)
  })
  it('sin nada cae a DEFAULT_PATTERN_WEIGHT', () => {
    expect(patternWeight([], 'x')).toBe(DEFAULT_PATTERN_WEIGHT)
  })
})
