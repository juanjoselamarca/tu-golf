import { describe, it, expect } from 'vitest'
import { segundosDesdeElDato, textoActualizadoHace } from './actualizado-hace'

describe('actualizado-hace', () => {
  it('suma lo que el dato estuvo en el CDN (Age) a lo que pasó desde que llegó', () => {
    expect(segundosDesdeElDato(1_000_000, 8, 1_003_000)).toBe(11)
    expect(segundosDesdeElDato(1_000_000, 0, 1_000_000)).toBe(0)
  })
  it('sin dato o sin reloj todavía: 0', () => {
    expect(segundosDesdeElDato(null, 5, 1_000)).toBe(0)
    expect(segundosDesdeElDato(1_000, 5, 0)).toBe(0)
  })
  it('copy', () => {
    expect(textoActualizadoHace(4)).toBe('Justo ahora')
    expect(textoActualizadoHace(12)).toBe('Actualizado hace 12s')
    expect(textoActualizadoHace(125)).toBe('Actualizado hace 2m')
  })
})
