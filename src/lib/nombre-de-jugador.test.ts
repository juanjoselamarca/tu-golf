import { describe, it, expect } from 'vitest'
import { nombreOJugadorN } from './nombre-de-jugador'

describe('nombreOJugadorN', () => {
  it('usa el nombre escrito, sin espacios de sobra', () => {
    expect(nombreOJugadorN('  Ana Soto ', 2)).toBe('Ana Soto')
  })
  it('sin nombre (vacío, solo espacios, null o undefined) muestra "Jugador N" con el número en pantalla', () => {
    expect(nombreOJugadorN('', 2)).toBe('Jugador 2')
    expect(nombreOJugadorN('   ', 3)).toBe('Jugador 3')
    expect(nombreOJugadorN(null, 4)).toBe('Jugador 4')
    expect(nombreOJugadorN(undefined, 5)).toBe('Jugador 5')
  })
})
