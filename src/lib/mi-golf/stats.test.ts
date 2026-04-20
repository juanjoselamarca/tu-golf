// src/lib/mi-golf/stats.test.ts
import { describe, it, expect } from 'vitest'
import { calcularStatsForma } from './stats'
import type { HistoricalRound } from './types'

const mk = (id: string, gross: number, course: string, daysAgo = 1): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: course,
  played_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
  diferencial: null,
})

describe('calcularStatsForma', () => {
  it('devuelve valores null/0 cuando no hay rondas', () => {
    const s = calcularStatsForma([], 72)
    expect(s.promedioUltimas5).toBeNull()
    expect(s.mejorScore).toBeNull()
    expect(s.rondasJugadas).toBe(0)
    expect(s.canchaFavorita).toBeNull()
  })

  it('promedia las últimas 5 rondas por played_at descendente', () => {
    const rondas = [
      mk('1', 85, 'A', 1),
      mk('2', 80, 'A', 2),
      mk('3', 90, 'B', 3),
      mk('4', 78, 'A', 4),
      mk('5', 82, 'B', 5),
      mk('6', 100, 'C', 10),
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.promedioUltimas5).toBe(83)
  })

  it('calcula mejor score vs par usando el par pasado', () => {
    const rondas = [mk('1', 85, 'A'), mk('2', 75, 'B')]
    const s = calcularStatsForma(rondas, 72)
    expect(s.mejorScore).toEqual({ gross: 75, vsPar: 3 })
  })

  it('detecta cancha favorita por frecuencia', () => {
    const rondas = [
      mk('1', 85, 'Sport Francés'),
      mk('2', 80, 'Sport Francés'),
      mk('3', 90, 'Los Leones'),
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.canchaFavorita).toEqual({ nombre: 'Sport Francés', vecesJugada: 2 })
  })

  it('ignora rondas sin total_gross para mejor score', () => {
    const rondas = [
      { id: '1', total_gross: null, course_name: 'A', played_at: '2026-04-01', diferencial: null },
      mk('2', 80, 'A'),
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.mejorScore).toEqual({ gross: 80, vsPar: 8 })
  })
})
