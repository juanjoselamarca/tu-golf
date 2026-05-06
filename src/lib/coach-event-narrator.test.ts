import { describe, it, expect } from 'vitest'
import { narrateEvent } from './coach-event-narrator'

describe('narrateEvent', () => {
  it('plan_assigned habla en humano del patrón', () => {
    const out = narrateEvent({
      type: 'plan_assigned',
      payload: { pattern_id: 'three_putt_frequency' },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('success')
    expect(out.title).toMatch(/Coach asignó un plan/)
    expect(out.subtitle).toMatch(/3-putts/)
    expect(out.important).toBe(true)
  })

  it('plan_outcome con compliance unknown explica el porqué', () => {
    const out = narrateEvent({
      type: 'plan_outcome',
      payload: { compliance: 'unknown', metric: 'three_putts_per_round', metric_value: 0 },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('muted')
    expect(out.title).toMatch(/no se pudo evaluar/)
    expect(out.subtitle).toMatch(/datos que la app todavía no captura/)
  })

  it('plan_outcome target_reached muestra ✓ y métrica humana', () => {
    const out = narrateEvent({
      type: 'plan_outcome',
      payload: { compliance: 'full', target_reached: true, metric: 'avg_first_hole_score', metric_value: 4.2 },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('success')
    expect(out.title).toMatch(/dentro de la meta/)
    expect(out.subtitle).toMatch(/score hoyo 1/)
    expect(out.subtitle).toMatch(/4.2/)
  })

  it('hallucination_check flagged describe qué inventó', () => {
    const out = narrateEvent({
      type: 'hallucination_check',
      payload: {
        flagged: true,
        warnings: [
          { kind: 'unknown_number', evidence: '92', context_snippet: 'tu score 92' },
          { kind: 'unknown_course', evidence: 'Hurlingham', context_snippet: 'jugaste Hurlingham' },
        ],
      },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('danger')
    expect(out.title).toMatch(/inventado/)
    expect(out.title).toMatch(/números y nombres de canchas/)
    expect(out.subtitle).toMatch(/2 cosas detectadas/)
    expect(out.important).toBe(true)
  })

  it('hallucination_check sin flag no es importante', () => {
    const out = narrateEvent({
      type: 'hallucination_check',
      payload: { flagged: false },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('muted')
    expect(out.title).toMatch(/sin inventar/)
    expect(out.important).toBe(false)
  })

  it('tool_called OK sale como muted/no importante', () => {
    const out = narrateEvent({
      type: 'tool_called',
      payload: { tool_name: 'get_latest_round', ok: true, ms: 120 },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('muted')
    expect(out.title).toMatch(/última ronda/)
    expect(out.subtitle).toMatch(/120 ms/)
    expect(out.important).toBe(false)
  })

  it('tool_called con error es danger e importante', () => {
    const out = narrateEvent({
      type: 'tool_called',
      payload: { tool_name: 'save_plan', ok: false, error: 'Constraint violation', ms: 45 },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('danger')
    expect(out.title).toMatch(/Falló al consultar/)
    expect(out.subtitle).toBe('Constraint violation')
    expect(out.important).toBe(true)
  })

  it('extractor_shadow con detección dice "habló sin guardar"', () => {
    const out = narrateEvent({
      type: 'extractor_shadow',
      payload: { regex_extracted_count: 3 },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('warning')
    expect(out.title).toMatch(/Habló de un plan en prosa/)
    expect(out.subtitle).toMatch(/No comprometió formalmente/)
  })

  it('round_processed backfilled etiqueta como histórico', () => {
    const out = narrateEvent({
      type: 'round_processed',
      payload: { course_name: 'Marbella', total_gross: 85, backfilled: true },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.title).toMatch(/Ronda histórica/)
    expect(out.subtitle).toMatch(/Marbella/)
    expect(out.subtitle).toMatch(/85 golpes/)
  })

  it('hallucination_review muestra el veredicto del admin', () => {
    const fp = narrateEvent({
      type: 'hallucination_review',
      payload: { verdict: 'false_positive' },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(fp.title).toMatch(/falsa alarma/)
    const real = narrateEvent({
      type: 'hallucination_review',
      payload: { verdict: 'real' },
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(real.title).toMatch(/inventó/)
  })

  it('tipo desconocido no rompe', () => {
    const out = narrateEvent({
      type: 'unknown_type_xyz',
      payload: {},
      created_at: '2026-05-05T12:00:00Z',
    })
    expect(out.level).toBe('muted')
    expect(out.title).toBe('unknown_type_xyz')
    expect(out.important).toBe(false)
  })
})
