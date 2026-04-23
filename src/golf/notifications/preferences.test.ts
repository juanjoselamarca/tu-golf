/**
 * Tests para src/golf/notifications/preferences.ts — motor de preferencias.
 *
 * Este archivo decide QUÉ notificaciones recibe el usuario. Tiene ALWAYS_ON
 * (hole_in_one, save_error) que no deben poder silenciarse por seguridad.
 * Cobertura previa: 0%.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getNotificationLevel,
  setNotificationLevel,
  isEventEnabled,
  getDefaultLevel,
  getEventStates,
} from './preferences'

beforeEach(() => {
  localStorage.clear()
})

describe('getNotificationLevel / setNotificationLevel', () => {
  it('default es "important" sin localStorage', () => {
    expect(getNotificationLevel()).toBe('important')
  })

  it('persiste el nivel seteado', () => {
    setNotificationLevel('all')
    expect(getNotificationLevel()).toBe('all')
  })

  it('acepta los 3 niveles válidos', () => {
    setNotificationLevel('minimal')
    expect(getNotificationLevel()).toBe('minimal')
    setNotificationLevel('important')
    expect(getNotificationLevel()).toBe('important')
    setNotificationLevel('all')
    expect(getNotificationLevel()).toBe('all')
  })

  it('valor corrupto en storage → default "important"', () => {
    localStorage.setItem('golfers-notification-level', 'garbage')
    expect(getNotificationLevel()).toBe('important')
  })
})

describe('isEventEnabled', () => {
  it('ALWAYS_ON: hole_in_one siempre true, incluso en minimal', () => {
    expect(isEventEnabled('hole_in_one', 'minimal')).toBe(true)
    expect(isEventEnabled('hole_in_one', 'important')).toBe(true)
    expect(isEventEnabled('hole_in_one', 'all')).toBe(true)
  })

  it('ALWAYS_ON: save_error siempre true', () => {
    expect(isEventEnabled('save_error', 'minimal')).toBe(true)
    expect(isEventEnabled('save_error', 'all')).toBe(true)
  })

  it('nivel "all" habilita birdie', () => {
    expect(isEventEnabled('birdie', 'all')).toBe(true)
  })

  it('nivel "important" habilita birdie (es default + eventos clave)', () => {
    expect(isEventEnabled('birdie', 'important')).toBe(true)
    expect(isEventEnabled('eagle', 'important')).toBe(true)
    expect(isEventEnabled('personal_best', 'important')).toBe(true)
  })

  it('nivel "minimal" NO habilita birdie/eagle', () => {
    expect(isEventEnabled('birdie', 'minimal')).toBe(false)
    expect(isEventEnabled('eagle', 'minimal')).toBe(false)
  })

  it('nivel "minimal" habilita round_finished y tournament_finished', () => {
    expect(isEventEnabled('round_finished', 'minimal')).toBe(true)
    expect(isEventEnabled('tournament_finished', 'minimal')).toBe(true)
  })

  it('eventos sociales solo en nivel "all" (friend_round_finished)', () => {
    expect(isEventEnabled('friend_round_finished', 'all')).toBe(true)
    expect(isEventEnabled('friend_round_finished', 'important')).toBe(false)
    expect(isEventEnabled('friend_round_finished', 'minimal')).toBe(false)
  })

  it('score_saved solo en "all" (muy granular)', () => {
    expect(isEventEnabled('score_saved', 'all')).toBe(true)
    expect(isEventEnabled('score_saved', 'important')).toBe(false)
  })

  it('usa nivel stored si no se pasa explícito', () => {
    setNotificationLevel('minimal')
    expect(isEventEnabled('birdie')).toBe(false)
    setNotificationLevel('all')
    expect(isEventEnabled('birdie')).toBe(true)
  })
})

describe('getDefaultLevel', () => {
  it('player → important', () => {
    expect(getDefaultLevel('player')).toBe('important')
  })

  it('organizer → important', () => {
    expect(getDefaultLevel('organizer')).toBe('important')
  })

  it('spectator → important', () => {
    expect(getDefaultLevel('spectator')).toBe('important')
  })
})

describe('getEventStates', () => {
  it('devuelve 12 eventos con metadata', () => {
    const states = getEventStates('important')
    expect(states).toHaveLength(12)
    for (const s of states) {
      expect(s).toHaveProperty('event')
      expect(s).toHaveProperty('enabled')
      expect(s).toHaveProperty('locked')
      expect(s).toHaveProperty('label')
      expect(s).toHaveProperty('category')
    }
  })

  it('hole_in_one tiene locked=true y enabled=true', () => {
    const states = getEventStates('minimal')
    const hio = states.find(s => s.event === 'hole_in_one')!
    expect(hio.locked).toBe(true)
    expect(hio.enabled).toBe(true)
  })

  it('save_error tiene locked=true y enabled=true en cualquier nivel', () => {
    for (const level of ['minimal', 'important', 'all'] as const) {
      const states = getEventStates(level)
      const se = states.find(s => s.event === 'save_error')!
      expect(se.locked).toBe(true)
      expect(se.enabled).toBe(true)
    }
  })

  it('birdie NO está locked (el usuario puede controlarlo)', () => {
    const states = getEventStates('all')
    const birdie = states.find(s => s.event === 'birdie')!
    expect(birdie.locked).toBe(false)
  })

  it('en "minimal", birdie.enabled=false', () => {
    const states = getEventStates('minimal')
    const birdie = states.find(s => s.event === 'birdie')!
    expect(birdie.enabled).toBe(false)
  })

  it('en "all", birdie.enabled=true', () => {
    const states = getEventStates('all')
    const birdie = states.find(s => s.event === 'birdie')!
    expect(birdie.enabled).toBe(true)
  })

  it('categorías esperadas (during_round, social, system)', () => {
    const states = getEventStates('all')
    const categorias = new Set(states.map(s => s.category))
    expect(categorias).toContain('during_round')
    expect(categorias).toContain('social')
    expect(categorias).toContain('system')
  })

  it('usa nivel stored si no se pasa', () => {
    setNotificationLevel('minimal')
    const states = getEventStates()
    const birdie = states.find(s => s.event === 'birdie')!
    expect(birdie.enabled).toBe(false)
  })
})
