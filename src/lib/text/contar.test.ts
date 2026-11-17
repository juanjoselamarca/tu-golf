import { describe, it, expect } from 'vitest'
import { concordar, contar } from './contar'

describe('contar', () => {
  it('singular solo con 1', () => {
    expect(contar(1, 'espiral', 'espirales')).toBe('1 espiral')
  })
  it('plural con 0 y con más de 1', () => {
    expect(contar(0, 'espiral', 'espirales')).toBe('0 espirales')
    expect(contar(3, 'golpe evitable', 'golpes evitables')).toBe('3 golpes evitables')
  })
  it('invariables', () => {
    expect(contar(1, 'tilt', 'tilt')).toBe('1 tilt')
    expect(contar(4, 'tilt', 'tilt')).toBe('4 tilt')
  })
})

describe('concordar', () => {
  it('solo el sustantivo', () => {
    expect(concordar(1, 'golpe evitable', 'golpes evitables')).toBe('golpe evitable')
    expect(concordar(2, 'golpe evitable', 'golpes evitables')).toBe('golpes evitables')
  })
})
