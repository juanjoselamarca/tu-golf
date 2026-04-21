// src/lib/mi-golf/tendencia.test.ts
import { describe, it, expect } from 'vitest'
import { calcularTendencia } from './tendencia'
import type { HistoricalRound } from './types'

const mkRound = (id: string, daysAgo: number, diferencial: number): HistoricalRound => ({
  id,
  total_gross: 80,
  course_name: 'Test',
  played_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
  diferencial,
  holes_played: 18,
})

describe('calcularTendencia', () => {
  it('devuelve null si hay menos de 5 rondas históricas', () => {
    const rondas = [mkRound('1', 5, 10), mkRound('2', 10, 11)]
    expect(calcularTendencia(10.5, rondas)).toBeNull()
  })

  it('detecta mejora cuando diferencial promedio reciente es menor al índice actual', () => {
    const rondas = [
      mkRound('1', 1, 9),
      mkRound('2', 5, 9),
      mkRound('3', 10, 9),
      mkRound('4', 15, 9),
      mkRound('5', 20, 9),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t).not.toBeNull()
    expect(t!.direccion).toBe('up')
    expect(t!.delta).toBeCloseTo(1.0, 1)
    expect(t!.dias).toBe(30)
  })

  it('detecta empeoramiento cuando diferencial reciente es mayor', () => {
    const rondas = [
      mkRound('1', 1, 12),
      mkRound('2', 5, 12),
      mkRound('3', 10, 12),
      mkRound('4', 15, 12),
      mkRound('5', 20, 12),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t!.direccion).toBe('down')
    expect(t!.delta).toBeCloseTo(2.0, 1)
  })

  it('devuelve flat cuando delta es menor a 0.2', () => {
    const rondas = [
      mkRound('1', 1, 10.1),
      mkRound('2', 5, 10.0),
      mkRound('3', 10, 9.9),
      mkRound('4', 15, 10.0),
      mkRound('5', 20, 10.1),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t!.direccion).toBe('flat')
  })

  it('ignora rondas fuera de la ventana de 30 días', () => {
    const rondas = [
      mkRound('1', 1, 9),
      mkRound('2', 10, 9),
      mkRound('3', 45, 9),
      mkRound('4', 60, 9),
      mkRound('5', 90, 9),
    ]
    expect(calcularTendencia(10.0, rondas)).toBeNull()
  })
})
