import { describe, it, expect } from 'vitest'
import { EXAM_CASES, type ExamSeed } from '../fixtures'
import { buildExamFocusDeps } from '../exam-focus-deps'
import { getFocus } from '../../focus/get-focus'
import type { Focus } from '../../focus/types'

/**
 * P3 — los seeds del banco disparan un patrón concreto y DIVERSO.
 *
 * Estos tests "pinean" qué foco produce el motor REAL (get_focus con deps
 * congeladas) sobre las tarjetas por hoyo de cada caso. Si alguien toca un
 * scorecard y rompe el patrón (o hace que otro patrón lo gane), salta acá —
 * antes de que el examen LIVE mida un foco distinto al diseñado.
 *
 * Con pesos uniformes (examen) el ranking es por confianza del detect, así que
 * el patrón intencionado debe ganar por confianza. Ver `probe` de diseño.
 */

function seedOf(id: string): ExamSeed {
  const c = EXAM_CASES.find((x) => x.id === id)
  if (!c) throw new Error(`caso no encontrado: ${id}`)
  return c.seed
}
async function focusOf(id: string) {
  return getFocus('exam-user', buildExamFocusDeps(seedOf(id)))
}

describe('P3 — seeds del banco disparan focos concretos y diversos', () => {
  it('seis_piezas_foco_completo (Lomas profundo) → post_bogey_spiral', async () => {
    const r = await focusOf('seis_piezas_foco_completo')
    expect(r.kind).toBe('focus')
    expect((r as Focus).patternId).toBe('post_bogey_spiral')
  })

  it('seis_piezas_con_meta comparte el seed profundo → mismo foco post_bogey_spiral', async () => {
    const r = await focusOf('seis_piezas_con_meta')
    expect(r.kind).toBe('focus')
    expect((r as Focus).patternId).toBe('post_bogey_spiral')
  })

  it('seis_piezas_otra_cancha (Prince) → back_nine_collapse (patrón DISTINTO)', async () => {
    const r = await focusOf('seis_piezas_otra_cancha')
    expect(r.kind).toBe('focus')
    expect((r as Focus).patternId).toBe('back_nine_collapse')
  })

  it('el banco mide focos DIVERSOS: Lomas y Prince no comparten patrón', async () => {
    const lomas = (await focusOf('seis_piezas_foco_completo')) as Focus
    const prince = (await focusOf('seis_piezas_otra_cancha')) as Focus
    expect(lomas.patternId).not.toBe(prince.patternId)
  })

  it('el foco trae evidencia y métrica reales (el coach puede dar el hecho + delta)', async () => {
    const r = (await focusOf('seis_piezas_foco_completo')) as Focus
    expect(r.metrica.valor).not.toBeNull()
    expect(r.metrica.muestra).toBeGreaterThanOrEqual(3)
    expect(Object.keys(r.evidencia).length).toBeGreaterThan(0)
    expect(r.confianza).toBeGreaterThan(0)
  })

  it('seis_piezas_con_meta ata el foco a la meta (delta hacia handicap objetivo)', async () => {
    // El seed profundo trae índice 10; sin target en el seed el delta es null,
    // pero la métrica del foco existe igual (la meta la fija el coach con set_target).
    const r = (await focusOf('seis_piezas_con_meta')) as Focus
    expect(r.metrica.valor).not.toBeNull()
  })

  it('cold_start_fallback_honesto (2 rondas) sigue en fallback (gate del motor)', async () => {
    const r = await focusOf('cold_start_fallback_honesto')
    expect(r.kind).toBe('fallback')
  })

  it('target_propone_meta y progreso_como_vengo (seed profundo) devuelven foco, no fallback', async () => {
    expect((await focusOf('target_propone_meta')).kind).toBe('focus')
    expect((await focusOf('progreso_como_vengo')).kind).toBe('focus')
  })

  it('es DETERMINISTA: dos corridas del mismo seed dan el mismo foco', async () => {
    const a = await focusOf('seis_piezas_otra_cancha')
    const b = await focusOf('seis_piezas_otra_cancha')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
