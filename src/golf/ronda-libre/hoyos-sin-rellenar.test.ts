import { describe, expect, it } from 'vitest'
import { hoyosQueNoSeRellenan } from './hoyos-sin-rellenar'

const orden = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const jugadores = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('hoyosQueNoSeRellenan', () => {
  it('sin match ni retiro: ninguno', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', ordenHoyos: orden })).toEqual([])
  })

  it('retirado: los hoyos desde el retiro en orden de juego (salida por el 10)', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'b', retiros: { b: 7 }, ordenHoyos: orden })).toEqual([7, 8, 9])
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'b', retiros: { b: 18 }, ordenHoyos: orden }))
      .toEqual([18, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('el retiro de otro no toca a este jugador', () => {
    expect(hoyosQueNoSeRellenan({ matchResult: null, jugadores, jugadorId: 'a', retiros: { b: 7 }, ordenHoyos: orden })).toEqual([])
  })
})
