import { describe, it, expect } from 'vitest'
import { mejoresDelMes } from './mejor-del-mes'
import type { RondaNormalizada, MotivoFueraDeNumeros } from './rondas-normalizadas'

const HOY = '2026-11-16'

function ronda(
  id: string,
  played_at: string,
  vsPar: number | null,
  bucket: 18 | 9 | null = 18,
  fueraDePromedios: MotivoFueraDeNumeros | null = null,
): RondaNormalizada {
  return {
    id, course_name: 'Club', played_at, scores: [], total_gross: 80, holes_played: bucket ?? 12,
    import_source: null, parPerHole: null, vsPar, tarjeta: [], pares: [], hoyosEstimados: [],
    bucket, fueraDePromedios, cuentaHoyoAHoyo: false,
  }
}

describe('mejoresDelMes', () => {
  it('elige el vsPar más bajo del mes, no el gross', () => {
    const r = mejoresDelMes([ronda('a', '2026-11-10', 9), ronda('b', '2026-11-03', 4)], HOY)
    expect(r).toEqual([{ roundId: 'b', bucket: 18, vsPar: 4 }])
  })

  it('compara 9 con 9 y 18 con 18: una mejor por bucket, cada una con sus hoyos', () => {
    const r = mejoresDelMes([ronda('n1', '2026-11-12', 1, 9), ronda('d1', '2026-11-11', 6, 18), ronda('n2', '2026-11-05', 3, 9)], HOY)
    expect(r).toEqual([
      { roundId: 'd1', bucket: 18, vsPar: 6 },
      { roundId: 'n1', bucket: 9, vsPar: 1 },
    ])
  })

  it('ignora rondas fuera de los números (scramble, match play, parcial, imposible) y sin vsPar', () => {
    const r = mejoresDelMes([
      ronda('scramble', '2026-11-10', -8, 18, 'bola_compartida'),
      ronda('match', '2026-11-09', -3, 18, 'match_play'),
      ronda('parcial', '2026-11-08', -20, null, 'parcial'),
      ronda('27h', '2026-11-07', null, 18),
      ronda('buena', '2026-11-06', 5),
    ], HOY)
    expect(r).toEqual([{ roundId: 'buena', bucket: 18, vsPar: 5 }])
  })

  it('solo el mes calendario de hoy', () => {
    expect(mejoresDelMes([ronda('oct', '2026-10-31', -2)], HOY)).toEqual([])
    expect(mejoresDelMes([ronda('nov', '2026-11-01', 7)], HOY)).toEqual([{ roundId: 'nov', bucket: 18, vsPar: 7 }])
  })

  it('empate: gana la más antigua, sea cual sea el orden de entrada', () => {
    const a = ronda('nueva', '2026-11-14', 3)
    const b = ronda('vieja', '2026-11-02', 3)
    expect(mejoresDelMes([a, b], HOY)[0].roundId).toBe('vieja')
    expect(mejoresDelMes([b, a], HOY)[0].roundId).toBe('vieja')
  })

  it('empate el mismo día: la posterior en la lista (la data llega más reciente primero)', () => {
    const r = mejoresDelMes([ronda('tarde', '2026-11-14', 3), ronda('manana', '2026-11-14', 3)], HOY)
    expect(r[0].roundId).toBe('manana')
  })

  it('sin rondas que cuenten: vacío', () => {
    expect(mejoresDelMes([], HOY)).toEqual([])
  })
})
