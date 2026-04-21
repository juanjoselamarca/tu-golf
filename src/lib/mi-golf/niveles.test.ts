import { describe, it, expect } from 'vitest'
import { getNivel, NIVELES_ORDEN } from './niveles'

describe('getNivel', () => {
  it('clasifica Scratch para índices 0-3', () => {
    const n = getNivel(1.5)
    expect(n.nombre).toBe('Scratch')
    expect(n.indice_min).toBe(0)
    expect(n.indice_max).toBe(3)
    expect(n.nombre_siguiente).toBeNull()
    expect(n.golpes_hasta_siguiente).toBeNull()
  })

  it('clasifica Avanzado para índices 3-10', () => {
    const n = getNivel(7)
    expect(n.nombre).toBe('Avanzado')
    expect(n.nombre_siguiente).toBe('Scratch')
    expect(n.golpes_hasta_siguiente).toBe(4)
  })

  it('clasifica Intermedio para índices 10-18', () => {
    const n = getNivel(10.5)
    expect(n.nombre).toBe('Intermedio')
    expect(n.nombre_siguiente).toBe('Avanzado')
    expect(n.golpes_hasta_siguiente).toBeCloseTo(0.5, 1)
  })

  it('clasifica Amateur para índices 18-28', () => {
    const n = getNivel(25)
    expect(n.nombre).toBe('Amateur')
    expect(n.nombre_siguiente).toBe('Intermedio')
    expect(n.golpes_hasta_siguiente).toBe(7)
  })

  it('clasifica Novato para índices 28+', () => {
    const n = getNivel(35)
    expect(n.nombre).toBe('Novato')
    expect(n.nombre_siguiente).toBe('Amateur')
    expect(n.golpes_hasta_siguiente).toBe(7)
  })

  it('calcula posicion_en_banda con 0 en borde inferior (peor) y 1 en borde superior (mejor)', () => {
    const mejor = getNivel(10.01)
    const peor = getNivel(17.99)
    expect(mejor.posicion_en_banda).toBeGreaterThan(0.99)
    expect(peor.posicion_en_banda).toBeLessThan(0.01)
  })

  it('maneja índices en límites exactos de bandas asignándolos al nivel inferior', () => {
    const en_10 = getNivel(10)
    expect(en_10.nombre).toBe('Avanzado')
    const en_3 = getNivel(3)
    expect(en_3.nombre).toBe('Scratch')
  })

  it('maneja índice negativo clasificando como Scratch', () => {
    const n = getNivel(-1)
    expect(n.nombre).toBe('Scratch')
  })

  it('exporta NIVELES_ORDEN de peor a mejor para UI', () => {
    expect(NIVELES_ORDEN).toEqual(['Novato', 'Amateur', 'Intermedio', 'Avanzado', 'Scratch'])
  })
})
