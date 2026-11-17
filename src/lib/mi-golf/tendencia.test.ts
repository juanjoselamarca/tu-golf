import { describe, it, expect } from 'vitest'
import { calcularTendencia } from './tendencia'
import type { HistoricalRound } from './types'

const AHORA = new Date('2026-11-16T12:00:00').getTime()
const r = (id: string, diasAtras: number, diferencial: number | null): HistoricalRound => ({
  id,
  total_gross: 85,
  course_name: 'A',
  played_at: new Date(AHORA - diasAtras * 86400000).toISOString().slice(0, 10),
  diferencial,
  holes_played: 18,
})

describe('calcularTendencia', () => {
  it('compara los últimos 30 días contra los 30 anteriores: diferenciales más bajos = mejora', () => {
    const t = calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], AHORA)
    expect(t).toEqual({ direccion: 'up', delta: 3, dias: 30 })
  })

  it('diferenciales más altos = empeora', () => {
    const t = calcularTendencia([r('1', 2, 16), r('2', 10, 16), r('3', 20, 16), r('4', 35, 14), r('5', 40, 14), r('6', 50, 14)], AHORA)
    expect(t?.direccion).toBe('down')
    expect(t?.delta).toBe(2)
  })

  it('diferencia menor a 0.2: flat', () => {
    const t = calcularTendencia([r('1', 2, 12.1), r('2', 10, 12), r('3', 20, 12), r('4', 35, 12), r('5', 40, 12), r('6', 50, 12)], AHORA)
    expect(t?.direccion).toBe('flat')
  })

  it('menos de 3 rondas con diferencial en alguna ventana: sin tendencia', () => {
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15)], AHORA)).toBeNull()
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, null), r('3', 20, 12), r('4', 35, 14), r('5', 40, 15), r('6', 50, 13)], AHORA)).toBeNull()
  })

  it('rondas de hace más de 60 días no cuentan', () => {
    expect(calcularTendencia([r('1', 2, 10), r('2', 10, 11), r('3', 20, 12), r('4', 70, 14), r('5', 80, 15), r('6', 90, 13)], AHORA)).toBeNull()
  })

  it('no depende de ningún índice: un índice oficial viejo no inventa tendencia', () => {
    // Juego estable: mismo diferencial en ambas ventanas → flat, aunque el índice cargado diga otra cosa.
    const t = calcularTendencia([r('1', 2, 12), r('2', 10, 12), r('3', 20, 12), r('4', 35, 12), r('5', 40, 12), r('6', 50, 12)], AHORA)
    expect(t?.direccion).toBe('flat')
    expect(calcularTendencia.length).toBeLessThanOrEqual(2)
  })
})
