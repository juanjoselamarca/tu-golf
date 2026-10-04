import { describe, it, expect } from 'vitest'
import { grossPorHoyo } from './hole-scoring'

describe('grossPorHoyo — hole_scores → mapa hoyo→gross (fuente única)', () => {
  it('mapea por número de hoyo y omite los hoyos sin golpes', () => {
    const m = grossPorHoyo([
      { hole_number: 1, gross_score: 4 },
      { hole_number: 2, gross_score: null },
      { hole_number: 10, gross_score: 6 },
    ])
    expect(m).toEqual({ '1': 4, '10': 6 })
    // Indexar con número funciona igual (lo usan los scorers con Record<number, number>).
    expect(m[10]).toBe(6)
    expect(2 in m).toBe(false)
  })
  it('sin filas → mapa vacío', () => {
    expect(grossPorHoyo([])).toEqual({})
  })
})
