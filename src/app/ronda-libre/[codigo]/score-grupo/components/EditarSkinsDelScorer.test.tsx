import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import type { RondaLibre } from '@/types/ronda'
import { TEXTO_JUGADORES_FIJOS } from '../../components/skins/EditarSkins'
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
  // Revisión Fable #898 (P1-2): el primer «+» escondía la franja y las tarjetas subían bajo el dedo.
  it('tras el primer golpe en el hoyo de salida, la franja sigue con el mismo alto; al cambiar de hoyo se va', () => {
    const props = { ronda, vista, userId: CREADOR, fuera: {}, onGuardado: () => {} }
    const { container, rerender } = render(<EditarSkinsDelScorer {...props} enElHoyoDeSalida scores={{}} />)
    const altoDe = () => (container.firstElementChild as HTMLElement | null)?.style.minHeight
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
    const alto = altoDe()
    expect(alto).toBe('52px')

    rerender(<EditarSkinsDelScorer {...props} enElHoyoDeSalida scores={{ a: { 1: 4 } }} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.getByText(TEXTO_JUGADORES_FIJOS)).toBeTruthy()
    expect(altoDe()).toBe(alto)

    rerender(<EditarSkinsDelScorer {...props} enElHoyoDeSalida={false} scores={{ a: { 1: 4 } }} />)
    expect(screen.queryByText(TEXTO_JUGADORES_FIJOS)).toBeNull()
    // De vuelta al hoyo de salida con golpes: nunca se vio el botón en esta visita, no hay nada que reservar.
    rerender(<EditarSkinsDelScorer {...props} enElHoyoDeSalida scores={{ a: { 1: 4 } }} />)
    expect(screen.queryByText(TEXTO_JUGADORES_FIJOS)).toBeNull()
  })
  it('otro jugador nunca ve la franja fija', () => {
    render(<EditarSkinsDelScorer ronda={ronda} vista={vista} userId="otro" enElHoyoDeSalida scores={{ a: { 1: 4 } }} fuera={{}} onGuardado={() => {}} />)
    expect(screen.queryByText(TEXTO_JUGADORES_FIJOS)).toBeNull()
  })
  it('hayAlgoAnotadoEnElTelefono', () => {
    expect(hayAlgoAnotadoEnElTelefono({ a: {}, b: {} }, { a: {} })).toBe(false)
    expect(hayAlgoAnotadoEnElTelefono({ a: {} }, { b: { 3: true } })).toBe(true)
  })
})
