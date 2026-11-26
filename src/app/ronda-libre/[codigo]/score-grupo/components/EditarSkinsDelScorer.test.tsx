import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import type { RondaLibre } from '@/types/ronda'
import { EditarSkinsDelScorer, hayAlgoAnotadoEnElTelefono } from './EditarSkinsDelScorer'

vi.mock('@/lib/data/ronda-libre-nueva', () => ({ fetchTeesDeCancha: async () => [] }))

const CREADOR = 'u-c'
const ronda = {
  codigo: 'ABC123', creador_id: CREADOR, course_id: 'c1', recorridos: null, tees: 'blanco',
  ronda_libre_jugadores: [{ id: 'a', nombre: 'Ana', user_id: CREADOR, scores: {}, handicap: 10, handicap_de_inscripcion: null, tees: null }, { id: 'b', nombre: 'Beto', user_id: null, scores: {}, handicap: 20, handicap_de_inscripcion: null, tees: null }],
} as unknown as RondaLibre
const vista = { jugadorIds: ['a', 'b'], empezado: false, rondaCerrada: false, pozoPorJugador: 5000 } as unknown as VistaDelSkinsEnElScorer

function montar(over: Partial<Parameters<typeof EditarSkinsDelScorer>[0]> = {}) {
  render(<EditarSkinsDelScorer ronda={ronda} vista={vista} userId={CREADOR} enElHoyoDeSalida scores={{}} fuera={{}} onGuardado={() => {}} {...over} />)
  return screen.queryByRole('button', { name: 'Editar' })
}

describe('«Editar» en el scorer', () => {
  it('el creador en el hoyo de salida, sin nada anotado: lo ve', () => {
    expect(montar()).not.toBeNull()
  })
  it('otro jugador: no', () => {
    expect(montar({ userId: 'otro' })).toBeNull()
  })
  it('fuera del hoyo de salida: no', () => {
    expect(montar({ enElHoyoDeSalida: false })).toBeNull()
  })
  it('empezado según el servidor: no', () => {
    expect(montar({ vista: { ...vista, empezado: true } })).toBeNull()
  })
  it('este teléfono ya anotó un golpe o una X (aún sin subir): no', () => {
    expect(montar({ scores: { a: { 1: 4 } } })).toBeNull()
  })
  it('hayAlgoAnotadoEnElTelefono', () => {
    expect(hayAlgoAnotadoEnElTelefono({ a: {}, b: {} }, { a: {} })).toBe(false)
    expect(hayAlgoAnotadoEnElTelefono({ a: {} }, { b: { 3: true } })).toBe(true)
  })
})
