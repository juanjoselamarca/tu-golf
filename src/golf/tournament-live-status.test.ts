import { describe, it, expect } from 'vitest'
import { torneoEnVivo, GRACE_DIAS_TORNEO } from './tournament-live-status'

const HOY = new Date('2026-06-11T15:00:00') // hora local del test

describe('torneoEnVivo', () => {
  it('no en progreso → nunca en vivo', () => {
    expect(torneoEnVivo('draft', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo('closed', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo('published', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo(null, '2026-06-11', null, HOY)).toBe(false)
  })

  it('in_progress hoy → en vivo', () => {
    expect(torneoEnVivo('in_progress', '2026-06-11', null, HOY)).toBe(true)
    expect(torneoEnVivo('active', '2026-06-11', null, HOY)).toBe(true)
  })

  it('in_progress con fecha FUTURA → NO en vivo (no empezó)', () => {
    // El caso real del test de personas: 30-oct-2026 marcado EN VIVO el 11-jun.
    expect(torneoEnVivo('in_progress', '2026-10-30', null, HOY)).toBe(false)
    expect(torneoEnVivo('in_progress', '2026-06-12', null, HOY)).toBe(false) // mañana
  })

  it('in_progress con fecha de hace meses → NO en vivo (abandonado)', () => {
    expect(torneoEnVivo('in_progress', '2026-05-12', null, HOY)).toBe(false)
    expect(torneoEnVivo('in_progress', '2026-03-30', null, HOY)).toBe(false)
  })

  it('multi-día real: hoy entre date_start y date_end → en vivo', () => {
    expect(torneoEnVivo('in_progress', '2026-06-10', '2026-06-13', HOY)).toBe(true)
    expect(torneoEnVivo('in_progress', '2026-06-11', '2026-06-11', HOY)).toBe(true)
  })

  it('gracia: terminó hace ≤ GRACE_DIAS → sigue en vivo; más → no', () => {
    const finHaceGrace = '2026-06-09' // 2 días atrás
    expect(torneoEnVivo('in_progress', finHaceGrace, finHaceGrace, HOY)).toBe(true)
    const finHaceGracePlus1 = '2026-06-08' // 3 días atrás
    expect(GRACE_DIAS_TORNEO).toBe(2)
    expect(torneoEnVivo('in_progress', finHaceGracePlus1, finHaceGracePlus1, HOY)).toBe(false)
  })

  it('sin date_start (dato viejo) → fail-open, respeta el status', () => {
    expect(torneoEnVivo('in_progress', null, null, HOY)).toBe(true)
    expect(torneoEnVivo('draft', null, null, HOY)).toBe(false)
  })

  it('tolera timestamps completos en date_start/date_end (slice a YYYY-MM-DD)', () => {
    expect(torneoEnVivo('in_progress', '2026-06-11T08:00:00Z', null, HOY)).toBe(true)
    expect(torneoEnVivo('in_progress', '2026-10-30T00:00:00Z', null, HOY)).toBe(false)
  })
})
