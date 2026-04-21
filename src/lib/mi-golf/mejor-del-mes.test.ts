import { describe, it, expect } from 'vitest'
import { esMejorDelMes } from './mejor-del-mes'
import type { HistoricalRound } from './types'

const mk = (id: string, gross: number, playedAt: string): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: 'X',
  played_at: playedAt,
  diferencial: null,
})

describe('esMejorDelMes', () => {
  it('marca true para la ronda con menor gross del mes', () => {
    const hoy = '2026-04-21'
    const historico = [
      mk('1', 80, '2026-04-05'),
      mk('2', 75, '2026-04-10'),
      mk('3', 82, '2026-04-15'),
      mk('4', 70, '2026-03-15'),
    ]
    expect(esMejorDelMes(historico[0], historico, hoy)).toBe(false)
    expect(esMejorDelMes(historico[1], historico, hoy)).toBe(true)
    expect(esMejorDelMes(historico[2], historico, hoy)).toBe(false)
    expect(esMejorDelMes(historico[3], historico, hoy)).toBe(false)
  })

  it('retorna false si la ronda no tiene total_gross', () => {
    const hoy = '2026-04-21'
    const ronda = { id: '1', total_gross: null, course_name: 'X', played_at: '2026-04-05', diferencial: null }
    expect(esMejorDelMes(ronda, [ronda], hoy)).toBe(false)
  })

  it('empata: solo la primera (más antigua) gana', () => {
    const hoy = '2026-04-21'
    const historico = [
      mk('1', 75, '2026-04-05'),
      mk('2', 75, '2026-04-10'),
    ]
    expect(esMejorDelMes(historico[0], historico, hoy)).toBe(true)
    expect(esMejorDelMes(historico[1], historico, hoy)).toBe(false)
  })

  it('retorna false para rondas de meses anteriores aun si son mejores', () => {
    const hoy = '2026-04-21'
    const ronda = mk('1', 70, '2026-03-15')
    expect(esMejorDelMes(ronda, [ronda], hoy)).toBe(false)
  })
})
