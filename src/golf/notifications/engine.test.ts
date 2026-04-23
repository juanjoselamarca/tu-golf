/**
 * Tests para src/golf/notifications/engine.ts — motor de notificaciones.
 *
 * Este motor decide QUÉ notificar, A QUIÉN, CUÁNDO, y CON QUÉ intensidad
 * durante un torneo. Un bug aquí puede spamear al usuario, o peor, no
 * avisar de un save_error durante la cancha → score perdido.
 *
 * Cobertura previa: 0%.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { shouldNotify, detectBirdieStreak } from './engine'
import { setNotificationLevel } from './preferences'
import type { GolfEvent } from './types'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shouldNotify — respeto a preferencias', () => {
  it('evento no habilitado en minimal → notify=false', () => {
    setNotificationLevel('minimal')
    const ev: GolfEvent = { type: 'birdie', playerName: 'Juan', hole: 5 }
    const r = shouldNotify(ev)
    expect(r.notify).toBe(false)
    expect(r.feedbackType).toBe('none')
  })

  it('evento habilitado en nivel actual → notify=true', () => {
    setNotificationLevel('important')
    const ev: GolfEvent = { type: 'birdie', playerName: 'Juan', hole: 5 }
    expect(shouldNotify(ev).notify).toBe(true)
  })

  it('evento desconocido → notify=false (safety)', () => {
    setNotificationLevel('all')
    const ev = { type: 'evento_inexistente' } as unknown as GolfEvent
    const r = shouldNotify(ev)
    expect(r.notify).toBe(false)
  })
})

describe('shouldNotify — feedback por tipo de evento', () => {
  beforeEach(() => setNotificationLevel('all'))

  it('hole_in_one → celebration_epic + haptic largo + sharePrompt', () => {
    const r = shouldNotify({ type: 'hole_in_one', playerName: 'J', hole: 7 })
    expect(r.notify).toBe(true)
    expect(r.feedbackType).toBe('celebration_epic')
    expect(r.duration).toBe(6000)
    expect(r.showSharePrompt).toBe(true)
    expect(Array.isArray(r.hapticPattern)).toBe(true)
  })

  it('eagle → celebration_medium sin sharePrompt', () => {
    const r = shouldNotify({ type: 'eagle', playerName: 'J', hole: 2 })
    expect(r.feedbackType).toBe('celebration_medium')
    expect(r.showSharePrompt).toBe(false)
  })

  it('birdie → celebration_subtle con duration corto', () => {
    const r = shouldNotify({ type: 'birdie', playerName: 'J', hole: 3 })
    expect(r.feedbackType).toBe('celebration_subtle')
    expect(r.duration).toBe(1500)
  })

  it('save_error → toast_error con duration largo (8s para que se lea)', () => {
    const r = shouldNotify({ type: 'save_error' })
    expect(r.feedbackType).toBe('toast_error')
    expect(r.duration).toBe(8000)
  })

  it('score_saved → haptic_only (sin UI interruptiva)', () => {
    const r = shouldNotify({ type: 'score_saved' })
    expect(r.feedbackType).toBe('haptic_only')
  })

  it('leader_change → badge_only (no interrumpe)', () => {
    const r = shouldNotify({ type: 'leader_change', playerName: 'J' })
    expect(r.feedbackType).toBe('badge_only')
  })

  it('milestone → celebration_medium con sharePrompt', () => {
    const r = shouldNotify({
      type: 'milestone',
      extraData: { count: 50 },
    })
    expect(r.feedbackType).toBe('celebration_medium')
    expect(r.showSharePrompt).toBe(true)
  })

  it('personal_best con vsPar negativo → mensaje contiene negativo', () => {
    const r = shouldNotify({
      type: 'personal_best',
      courseName: 'Lomas',
      score: 68,
      vsPar: -4,
    })
    expect(r.message).toContain('Lomas')
    expect(r.message).toContain('68')
    expect(r.message).toContain('-4')
  })

  it('personal_best con vsPar positivo → prefix "+" en mensaje', () => {
    const r = shouldNotify({
      type: 'personal_best',
      courseName: 'X',
      score: 80,
      vsPar: 8,
    })
    expect(r.message).toContain('+8')
  })
})

describe('shouldNotify — horario para push_notification', () => {
  beforeEach(() => setNotificationLevel('all'))

  it('friend_eagle a las 10am → notify=true', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T10:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'A' })
    expect(r.notify).toBe(true)
    expect(r.feedbackType).toBe('push_notification')
  })

  it('friend_eagle a las 3am → notify=false (fuera de horario)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T03:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'A' })
    expect(r.notify).toBe(false)
  })

  it('friend_eagle a las 11pm → notify=false (después de 22)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T23:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'A' })
    expect(r.notify).toBe(false)
  })

  it('friend_eagle a las 7am exactas → notify=true (límite inferior)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T07:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'A' })
    expect(r.notify).toBe(true)
  })

  it('friend_eagle a las 10pm exactas → notify=true (límite superior)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T22:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'A' })
    expect(r.notify).toBe(true)
  })

  it('save_error NO sigue regla de horario (es ALWAYS_ON y no es push)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T03:00:00'))
    const r = shouldNotify({ type: 'save_error' })
    expect(r.notify).toBe(true) // save_error es toast_error, no push
  })
})

describe('shouldNotify — mensajes', () => {
  beforeEach(() => setNotificationLevel('all'))

  it('hole_in_one mensaje incluye jugador y hoyo', () => {
    const r = shouldNotify({ type: 'hole_in_one', playerName: 'Juan', hole: 3 })
    expect(r.message).toContain('Juan')
    expect(r.message).toContain('hoyo 3')
  })

  it('eagle mensaje', () => {
    const r = shouldNotify({ type: 'eagle', playerName: 'Ana', hole: 2 })
    expect(r.message).toContain('Ana')
    expect(r.message).toContain('Eagle')
    expect(r.message).toContain('hoyo 2')
  })

  it('birdie_streak mensaje', () => {
    const r = shouldNotify({ type: 'birdie_streak', playerName: 'Leo' })
    expect(r.message).toContain('Leo')
    expect(r.message).toContain('racha')
  })

  it('leader_change mensaje', () => {
    const r = shouldNotify({ type: 'leader_change', playerName: 'Nico' })
    expect(r.message).toContain('Nico')
    expect(r.message).toContain('liderato')
  })

  it('round_finished mensaje incluye courseName', () => {
    const r = shouldNotify({ type: 'round_finished', courseName: 'Brisas' })
    expect(r.message).toContain('Brisas')
  })

  it('sin playerName → usa "Jugador" default', () => {
    const r = shouldNotify({ type: 'eagle', hole: 4 })
    expect(r.message).toContain('Jugador')
  })

  it('evento sin template (friend_eagle) → mensaje ""', () => {
    // friend_eagle no está en el switch de buildMessage → ""
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T10:00:00'))
    const r = shouldNotify({ type: 'friend_eagle', playerName: 'X' })
    expect(r.message).toBe('')
  })
})

describe('detectBirdieStreak', () => {
  const pars = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }

  it('2 birdies consecutivos → true', () => {
    const scores = { 1: 3, 2: 3 }
    expect(detectBirdieStreak(scores, pars, 2)).toBe(true)
  })

  it('birdie actual pero par anterior → false', () => {
    const scores = { 1: 4, 2: 3 }
    expect(detectBirdieStreak(scores, pars, 2)).toBe(false)
  })

  it('par actual, birdie anterior → false', () => {
    const scores = { 1: 3, 2: 4 }
    expect(detectBirdieStreak(scores, pars, 2)).toBe(false)
  })

  it('eagle (-2) actual → false (no es birdie)', () => {
    const scores = { 1: 3, 2: 2 }
    expect(detectBirdieStreak(scores, pars, 2)).toBe(false)
  })

  it('currentHole=1 → false (no hay hoyo anterior)', () => {
    expect(detectBirdieStreak({ 1: 3 }, pars, 1)).toBe(false)
  })

  it('score faltante → trata como par (4 - 4 = 0, no birdie) → false', () => {
    const scores = { 2: 3 } // hoyo 1 sin score
    expect(detectBirdieStreak(scores, pars, 2)).toBe(false)
  })

  it('par faltante → usa default 4', () => {
    const scores = { 1: 3, 2: 3 }
    const parsSinDatos = {} // vacío, usa default 4
    expect(detectBirdieStreak(scores, parsSinDatos, 2)).toBe(true)
  })
})
