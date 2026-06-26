import { describe, it, expect } from 'vitest'
import { buildIntro, buildActivePlanSummary, type IntroContext, type ActivePlanOutcome } from './intro'

const base: IntroContext = {
  name: 'Juan',
  roundDaysAgo: null,
  courseLabel: 'la cancha',
  lastGross: null,
  hasPlan: false,
  planPatternId: null,
  outcomesCount: 0,
  targetsReached: 0,
  totalRounds: 50,
}

describe('buildIntro — opener + chips por contexto', () => {
  it('siempre devuelve exactamente 3 chips', () => {
    for (const ctx of [
      base,
      { ...base, roundDaysAgo: 0 },
      { ...base, roundDaysAgo: 2, lastGross: 87 },
      { ...base, hasPlan: true, planPatternId: 'back_nine_collapse', outcomesCount: 3, targetsReached: 2 },
      { ...base, totalRounds: 1 },
    ]) {
      expect(buildIntro(ctx).chips).toHaveLength(3)
    }
  })

  it('ronda hoy → recent_round, opener nombra la cancha', () => {
    const r = buildIntro({ ...base, roundDaysAgo: 0, courseLabel: 'Los Leones' })
    expect(r.hook_type).toBe('recent_round')
    expect(r.opener).toContain('Los Leones')
    expect(r.chips).toContain('Analiza mi última ronda')
  })

  it('ronda 1-7d con score → last_round_with_score, opener nombra el gross', () => {
    const r = buildIntro({ ...base, roundDaysAgo: 2, lastGross: 87, courseLabel: 'Sport Francés' })
    expect(r.hook_type).toBe('last_round_with_score')
    expect(r.opener).toContain('87')
  })

  it('plan con outcomes → chip de foco usa el patrón humanizado', () => {
    const r = buildIntro({ ...base, hasPlan: true, planPatternId: 'back_nine_collapse', outcomesCount: 4, targetsReached: 3 })
    expect(r.hook_type).toBe('plan_with_progress')
    expect(r.chips.some(c => c.includes('el back nine'))).toBe(true)
  })

  it('plan sin outcomes → plan_no_progress', () => {
    const r = buildIntro({ ...base, hasPlan: true, planPatternId: 'three_putt_frequency', outcomesCount: 0 })
    expect(r.hook_type).toBe('plan_no_progress')
  })

  it('>7d sin jugar → long_absence', () => {
    const r = buildIntro({ ...base, roundDaysAgo: 12 })
    expect(r.hook_type).toBe('long_absence')
  })

  it('<3 rondas → newcomer', () => {
    const r = buildIntro({ ...base, totalRounds: 1 })
    expect(r.hook_type).toBe('newcomer')
  })

  it('sin nada → fallback con chips genéricos', () => {
    const r = buildIntro(base)
    expect(r.hook_type).toBe('fallback')
    expect(r.chips).toEqual(['¿En qué debería enfocarme?', 'Dame un plan para esta semana', 'Analiza mi última ronda'])
  })

  it('prioridad: ronda hoy gana sobre plan activo', () => {
    const r = buildIntro({ ...base, roundDaysAgo: 0, hasPlan: true, planPatternId: 'par_3_weakness', outcomesCount: 5, targetsReached: 5 })
    expect(r.hook_type).toBe('recent_round')
  })
})

describe('buildActivePlanSummary (D3 — surfacing plan activo)', () => {
  const plan = { hypothesis: 'Tu back nine se cae', rule: 'Respira hondo antes del hoyo 10', status: 'active' }

  it('sin plan → null (ausencia elegante)', () => {
    expect(buildActivePlanSummary(null, [])).toBeNull()
    expect(buildActivePlanSummary(undefined, [{ target_reached: true, played_at: '2026-06-01' }])).toBeNull()
  })

  it('mapea title/description/status desde la fila del plan', () => {
    const r = buildActivePlanSummary(plan, [])
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Tu back nine se cae')
    expect(r!.description).toBe('Respira hondo antes del hoyo 10')
    expect(r!.status).toBe('active')
  })

  it('plan sin outcomes → dots vacíos, applied/total en 0', () => {
    const r = buildActivePlanSummary(plan, [])
    expect(r!.dots).toEqual([])
    expect(r!.applied).toBe(0)
    expect(r!.total).toBe(0)
  })

  it('applied/total cuentan TODOS los outcomes (no solo los 7 visibles)', () => {
    const outcomes: ActivePlanOutcome[] = Array.from({ length: 10 }, (_, i) => ({
      target_reached: i % 2 === 0, // 5 de 10 en target
      played_at: `2026-06-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    }))
    const r = buildActivePlanSummary(plan, outcomes)
    expect(r!.total).toBe(10)
    expect(r!.applied).toBe(5)
    expect(r!.dots).toHaveLength(7) // solo se muestran las 7 más recientes
  })

  it('dots quedan cronológicos (antigua → nueva) tomando las 7 más recientes', () => {
    const outcomes: ActivePlanOutcome[] = [
      { target_reached: true, played_at: '2026-06-03T12:00:00Z' },
      { target_reached: false, played_at: '2026-06-01T12:00:00Z' },
      { target_reached: true, played_at: '2026-06-02T12:00:00Z' },
    ]
    const r = buildActivePlanSummary(plan, outcomes)
    // ordenados ascendente por fecha: 01 (miss) → 02 (on) → 03 (on)
    expect(r!.dots.map(d => d.state)).toEqual(['miss', 'on', 'on'])
  })

  it('outcomes sin played_at se ignoran para dots pero cuentan en total', () => {
    const outcomes: ActivePlanOutcome[] = [
      { target_reached: true, played_at: null },
      { target_reached: true, played_at: '2026-06-02T12:00:00Z' },
    ]
    const r = buildActivePlanSummary(plan, outcomes)
    expect(r!.total).toBe(2)
    expect(r!.applied).toBe(2)
    expect(r!.dots).toHaveLength(1)
  })

  it('played_at no parseable se ignora para dots pero cuenta en total (CERO FALLOS)', () => {
    const outcomes: ActivePlanOutcome[] = [
      { target_reached: true, played_at: 'no-es-fecha' },
      { target_reached: false, played_at: '2026-06-05T12:00:00Z' },
    ]
    const r = buildActivePlanSummary(plan, outcomes)
    expect(r!.total).toBe(2)
    expect(r!.dots).toHaveLength(1)
    expect(r!.dots[0].state).toBe('miss')
    expect(r!.dots.every(d => d.label !== '—' && !/Invalid/.test(d.label))).toBe(true)
  })

  it('status desconocido cae a active; hypothesis vacía cae a "Plan activo"', () => {
    const r = buildActivePlanSummary({ hypothesis: '  ', rule: null, status: 'weird' }, [])
    expect(r!.status).toBe('active')
    expect(r!.title).toBe('Plan activo')
    expect(r!.description).toBe('')
  })
})
