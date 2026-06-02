import { describe, it, expect } from 'vitest'
import { computeStoredTeamHandicap, resolvePlayerHandicap, isProducerTeamFormat } from './teamRounds'

describe('isProducerTeamFormat', () => {
  it('scramble y foursome → true', () => {
    expect(isProducerTeamFormat('scramble')).toBe(true)
    expect(isProducerTeamFormat('foursome')).toBe(true)
  })

  it('best_ball → false (el scorer aún no carga sus equipos)', () => {
    expect(isProducerTeamFormat('best_ball')).toBe(false)
  })

  it('formatos individuales y vacíos → false', () => {
    expect(isProducerTeamFormat('stroke_play')).toBe(false)
    expect(isProducerTeamFormat(undefined)).toBe(false)
    expect(isProducerTeamFormat(null)).toBe(false)
  })
})

describe('computeStoredTeamHandicap', () => {
  describe('scramble (USGA por nº de jugadores)', () => {
    it('2 jugadores: 35% menor + 15% mayor', () => {
      // 0.35*10 + 0.15*20 = 3.5 + 3 = 6.5
      expect(computeStoredTeamHandicap('scramble', [20, 10])).toBe(6.5)
    })

    it('3 jugadores: 20% menor + 15% medio + 10% mayor', () => {
      // 0.20*5 + 0.15*15 + 0.10*25 = 1 + 2.25 + 2.5 = 5.75 → 5.8
      expect(computeStoredTeamHandicap('scramble', [25, 5, 15])).toBe(5.8)
    })

    it('4 jugadores: 25/20/15/10', () => {
      // 0.25*4 + 0.20*8 + 0.15*12 + 0.10*16 = 1 + 1.6 + 1.8 + 1.6 = 6
      expect(computeStoredTeamHandicap('scramble', [16, 12, 8, 4])).toBe(6)
    })

    it('ordena internamente (no depende del orden de entrada)', () => {
      expect(computeStoredTeamHandicap('scramble', [10, 20])).toBe(
        computeStoredTeamHandicap('scramble', [20, 10]),
      )
    })
  })

  describe('foursome ((A+B)/2 entero)', () => {
    it('promedia y redondea al entero', () => {
      // (15 + 10) / 2 = 12.5 → 13 (Math.round redondea .5 hacia arriba)
      expect(computeStoredTeamHandicap('foursome', [15, 10])).toBe(13)
    })

    it('si falta el segundo handicap usa 0', () => {
      // (12 + 0) / 2 = 6
      expect(computeStoredTeamHandicap('foursome', [12])).toBe(6)
    })
  })

  describe('best_ball', () => {
    it('no almacena handicap de equipo (null) — cada jugador con el suyo', () => {
      expect(computeStoredTeamHandicap('best_ball', [10, 20])).toBeNull()
    })
  })

  it('formato no-equipo devuelve null', () => {
    expect(computeStoredTeamHandicap('stroke_play', [10, 20])).toBeNull()
  })
})

describe('resolvePlayerHandicap', () => {
  it('prefiere profiles.indice (índice vivo, consistente con el leaderboard)', () => {
    expect(
      resolvePlayerHandicap({ profiles: { indice: 12.4 }, handicap_at_registration: 18 }),
    ).toBe(12.4)
  })

  it('cae a handicap_at_registration cuando no hay índice', () => {
    expect(
      resolvePlayerHandicap({ profiles: { indice: null }, handicap_at_registration: 18 }),
    ).toBe(18)
  })

  it('cae a 0 cuando no hay nada (invitado sin índice ni registro)', () => {
    expect(resolvePlayerHandicap({ profiles: { indice: null }, handicap_at_registration: null })).toBe(0)
    expect(resolvePlayerHandicap({})).toBe(0)
  })

  it('índice 0 es válido y no se confunde con ausencia', () => {
    expect(
      resolvePlayerHandicap({ profiles: { indice: 0 }, handicap_at_registration: 18 }),
    ).toBe(0)
  })
})
