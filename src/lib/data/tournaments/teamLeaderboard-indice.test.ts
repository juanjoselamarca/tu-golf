import { describe, it, expect } from 'vitest'
import { indiceDelMiembro } from './teamLeaderboard'

describe('indiceDelMiembro — la tarjeta manda (scramble, foursome y best ball)', () => {
  const perfiles = new Map([['u-ana', 22.5]])
  it('con índice en la tarjeta: la tarjeta, aunque el perfil tenga otro (antes en scramble ganaba el perfil)', () => {
    expect(indiceDelMiembro({ user_id: 'u-ana', handicap: 10 }, perfiles)).toBe(10)
  })
  it('jugador con cuenta SIN índice en la tarjeta: el del perfil', () => {
    expect(indiceDelMiembro({ user_id: 'u-ana', handicap: null }, perfiles)).toBe(22.5)
  })
  it('invitado sin índice, o cuenta sin perfil: 0', () => {
    expect(indiceDelMiembro({ user_id: null, handicap: null }, perfiles)).toBe(0)
    expect(indiceDelMiembro({ user_id: 'u-otro', handicap: null }, perfiles)).toBe(0)
  })
})
