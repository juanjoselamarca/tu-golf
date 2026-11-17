// src/lib/mi-golf/stats.test.ts
import { describe, it, expect } from 'vitest'
import { calcularStatsForma } from './stats'
import type { HistoricalRound } from './types'
import type { RondaNormalizada, MotivoFueraDeNumeros } from '@/golf/stats/rondas-normalizadas'

const mk = (
  id: string,
  gross: number,
  course: string,
  daysAgo = 1,
  holes = 18
): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: course,
  played_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
  diferencial: null,
  holes_played: holes,
})

function norm(id: string, gross: number, vsPar: number, bucket: 18 | 9, fuera: MotivoFueraDeNumeros | null = null): RondaNormalizada {
  return {
    id, course_name: 'A', played_at: '2026-11-01', scores: [], total_gross: gross, holes_played: bucket,
    import_source: null, parPerHole: null, vsPar, tarjeta: [], pares: [], hoyosEstimados: [],
    bucket, fueraDePromedios: fuera, cuentaHoyoAHoyo: false,
  }
}

describe('calcularStatsForma', () => {
  it('devuelve valores null/0 cuando no hay rondas', () => {
    const s = calcularStatsForma([], [])
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
    const s = calcularStatsForma(rondas, [])
    expect(s.promedioUltimas5).toBe(83)
  })

  // Mejor score: el de /perfil/stats (agregarRondas sobre rondas normalizadas, bucket principal).
  it('mejor score sale de las rondas normalizadas, con par real y rotulado con sus hoyos', () => {
    // 75 en cancha par 71 = +4; el par 72 inventado decía +3.
    const s = calcularStatsForma([mk('1', 75, 'A')], [norm('1', 75, 4, 18)])
    expect(s.mejorScore).toEqual({ gross: 75, vsPar: 4, hoyos: 18 })
  })

  it('compara dentro del bucket que más juega: con más rondas de 9, la mejor de 9', () => {
    const s = calcularStatsForma([], [norm('a', 72, 0, 18), norm('b', 40, 4, 9), norm('c', 38, 2, 9)])
    expect(s.mejorScore).toEqual({ gross: 38, vsPar: 2, hoyos: 9 })
  })

  it('un scramble nunca es el mejor score', () => {
    const s = calcularStatsForma([], [norm('s', 62, -10, 18, 'bola_compartida'), norm('r', 80, 8, 18)])
    expect(s.mejorScore).toEqual({ gross: 80, vsPar: 8, hoyos: 18 })
  })

  it('sin rondas normalizadas que cuenten, no hay mejor score', () => {
    expect(calcularStatsForma([mk('1', 80, 'A')], []).mejorScore).toBeNull()
  })

  it('detecta cancha favorita por frecuencia', () => {
    const rondas = [
      mk('1', 85, 'Sport Francés'),
      mk('2', 80, 'Sport Francés'),
      mk('3', 90, 'Los Leones'),
    ]
    const s = calcularStatsForma(rondas, [])
    expect(s.canchaFavorita).toEqual({ nombre: 'Sport Francés', vecesJugada: 2 })
  })
})
