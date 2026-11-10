import { describe, it, expect } from 'vitest'
import { NOMBRE_EQUIPO_MAX, nombreDeEquipo, nombreVisibleDeEquipo } from './nombre-de-equipo'

describe('nombre de equipo de la ronda libre', () => {
  it('por defecto, "Equipo N" contando desde 1', () => {
    expect(nombreDeEquipo(0)).toBe('Equipo 1')
    expect(nombreDeEquipo(1)).toBe('Equipo 2')
  })

  it('vacío, nulo o solo espacios → el de por defecto de su posición (nunca se graba en blanco)', () => {
    expect(nombreVisibleDeEquipo('', 1)).toBe('Equipo 2')
    expect(nombreVisibleDeEquipo('   ', 0)).toBe('Equipo 1')
    expect(nombreVisibleDeEquipo(null, 0)).toBe('Equipo 1')
    expect(nombreVisibleDeEquipo(undefined, 1)).toBe('Equipo 2')
  })

  it('el nombre escrito se respeta, sin los espacios de los lados', () => {
    expect(nombreVisibleDeEquipo('  Los Leones ', 0)).toBe('Los Leones')
  })

  it('el tope que exige la API es 50 caracteres', () => {
    expect(NOMBRE_EQUIPO_MAX).toBe(50)
  })
})
