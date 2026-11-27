import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TeamLeaderboardsProps } from '../../components/TeamLeaderboards'
import type { RondaLibre } from '@/types/ronda'
import { TablaEnVivoDelScorer } from './TablaEnVivoDelScorer'

let recibido: TeamLeaderboardsProps | null = null
vi.mock('../../components/TeamLeaderboards', () => ({
  TeamLeaderboards: (p: TeamLeaderboardsProps) => { recibido = p; return null },
}))

const eq = (id: string, scores: Record<string, number> = {}) =>
  ({ id, nombre: id, handicap_equipo: 8, handicap_equipo_juego: 8, handicap_origen: 'club' as const, scores, jugadorIds: [], jugadorNombres: [], ronda_id: 'r1', anotador_user_id: null, anotador_nombre: null })

const ronda = { id: 'r1', fecha: '2026-11-28', formato_juego: 'scramble', ronda_libre_jugadores: [] } as unknown as RondaLibre

describe('TablaEnVivoDelScorer', () => {
  beforeEach(() => { recibido = null })

  it('arma la tabla del espectador con los equipos propios (lo recién anotado) y los de otro celular, sin repetir', () => {
    render(<TablaEnVivoDelScorer ronda={ronda}
      propios={[eq('e1', { '1': 3 })]} ajenos={[eq('e1', {}), eq('e2', { '1': 5 })]}
      parMap={{ 1: 4 }} holeDataMap={{ 1: { stroke_index: 7 } } as never} playerHcp={{}} playerDisplayHcp={{}} />)
    expect(recibido).not.toBeNull()
    expect(recibido!.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(recibido!.equipos[0].scores).toEqual({ '1': 3 }) // gana lo de este celular, no la relectura
    expect(recibido!.siMap).toEqual({ 1: 7 })
    expect(recibido!.enVivo).toBe(true)
  })

  it('sin equipos: una línea, no un panel en blanco', () => {
    const { getByText } = render(<TablaEnVivoDelScorer ronda={ronda} propios={[]} ajenos={[]}
      parMap={{ 1: 4 }} holeDataMap={{}} playerHcp={{}} playerDisplayHcp={{}} />)
    expect(getByText('La tabla aparece cuando haya equipos en la ronda.')).toBeTruthy()
    expect(recibido).toBeNull()
  })
})
