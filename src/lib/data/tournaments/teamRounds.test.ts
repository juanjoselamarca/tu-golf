import { describe, it, expect } from 'vitest'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'
import { handicapsDeEquipoDelGrupo, resolvePlayerHandicap, isProducerTeamFormat } from './teamRounds'

describe('isProducerTeamFormat', () => {
  it('scramble, foursome y best_ball → true', () => {
    expect(isProducerTeamFormat('scramble')).toBe(true)
    expect(isProducerTeamFormat('foursome')).toBe(true)
    expect(isProducerTeamFormat('best_ball')).toBe(true)
  })

  it('formatos individuales y vacíos → false', () => {
    expect(isProducerTeamFormat('stroke_play')).toBe(false)
    expect(isProducerTeamFormat(undefined)).toBe(false)
    expect(isProducerTeamFormat(null)).toBe(false)
  })
})

// Ejemplo D1 del plan: índices 10 / 20, tee Blancas slope 125 · CR 71, cancha par 71.
// 18 hoyos: CH 11,062 / 22,124 → 35 % + 15 % = 7,19 → 7.
// 9 hoyos (par 36, CR de 9 = 35,5): CH9 5,031 / 10,562 → 3,345 → 3 (partir el 7 daba 4).
const blancas = { id: 't1', nombre: 'Blancas', rating: 71, slope: 125, yardaje_total: 6200 }
const ctxWhs: LegacyHcpContext = {
  mode: 'whs',
  tees: 'Blancas',
  course: { par_total: 71, slope_rating: 125, course_rating: 71 },
  courseTees: [blancas],
  hcpPct: 100,
}
const jugador = (indice: number | null) => ({ handicap_at_registration: indice, tee_id: null })
const pareja = [jugador(10), jugador(20)]

describe('handicapsDeEquipoDelGrupo', () => {
  it('scramble 18 hoyos WHS: completo y de juego son el mismo (7)', () => {
    expect(
      handicapsDeEquipoDelGrupo({ formato: 'scramble', members: pareja, handicap: null, ctx: ctxWhs, parTotal: 71, holeCount: 18 }),
    ).toEqual({ completo: 7, juego: 7 })
  })

  it('scramble 9 hoyos WHS: completo 7 sobre 18 hoyos, de juego 3 con los ratings de 9', () => {
    expect(
      handicapsDeEquipoDelGrupo({ formato: 'scramble', members: pareja, handicap: { modo: 'oficial' }, ctx: ctxWhs, parTotal: 36, holeCount: 9 }),
    ).toEqual({ completo: 7, juego: 3 })
  })

  it('foursome WHS: 50 % de 11,062 + 22,124 = 16,59 → 17', () => {
    expect(
      handicapsDeEquipoDelGrupo({ formato: 'foursome', members: pareja, handicap: undefined, ctx: ctxWhs, parTotal: 71, holeCount: 18 }),
    ).toEqual({ completo: 17, juego: 17 })
  })

  it('personalizado [40, 10]: 4,425 + 2,212 = 6,64 → 7', () => {
    expect(
      handicapsDeEquipoDelGrupo({
        formato: 'scramble', members: pareja, handicap: { modo: 'personalizado', porcentajes: [40, 10] },
        ctx: ctxWhs, parTotal: 71, holeCount: 18,
      }),
    ).toEqual({ completo: 7, juego: 7 })
  })

  it('modo raw: usa lo inscrito (ya es course handicap) y deja el de juego en null', () => {
    const ctxRaw: LegacyHcpContext = { ...ctxWhs, mode: 'raw' }
    // 35 % de 8 + 15 % de 18 = 2,8 + 2,7 = 5,5 → 6
    expect(
      handicapsDeEquipoDelGrupo({ formato: 'scramble', members: [jugador(18), jugador(8)], handicap: null, ctx: ctxRaw, parTotal: 36, holeCount: 9 }),
    ).toEqual({ completo: 6, juego: null })
  })

  it('jugador sin índice inscrito cuenta como índice 0, igual que su handicap individual', () => {
    // CH 0 / 11,062 → 0 + 1,66 → 2
    expect(
      handicapsDeEquipoDelGrupo({ formato: 'scramble', members: [jugador(null), jugador(10)], handicap: null, ctx: ctxWhs, parTotal: 71, holeCount: 18 }),
    ).toEqual({ completo: 2, juego: 2 })
  })

  it('best ball y formatos individuales → sin handicap de equipo', () => {
    for (const formato of ['best_ball', 'stroke_play', null]) {
      expect(
        handicapsDeEquipoDelGrupo({ formato, members: pareja, handicap: null, ctx: ctxWhs, parTotal: 71, holeCount: 18 }),
      ).toEqual({ completo: null, juego: null })
    }
  })

  it('personalizado que no calza con los jugadores → null en ambos', () => {
    expect(
      handicapsDeEquipoDelGrupo({
        formato: 'scramble', members: [...pareja, jugador(5)], handicap: { modo: 'personalizado', porcentajes: [35, 15] },
        ctx: ctxWhs, parTotal: 71, holeCount: 18,
      }),
    ).toEqual({ completo: null, juego: null })
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
