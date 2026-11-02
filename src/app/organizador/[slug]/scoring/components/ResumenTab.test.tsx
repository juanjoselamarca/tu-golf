// Revisión del PR #720: el hook se liberó del rango 0..54 pero la vista no —
// el input seguía con `min={0} max={54}` (el stepper no bajaba a los plus) y un
// plus 2 se mostraba "-2", invitando al organizador a "corregirlo" a 2.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Player } from '@/lib/golf-data'
import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'
import { RANGO_INDICE, type RangoHandicap } from '@/golf/handicap-index-range'
import type { UseHcpEditorReturn } from '../hooks/useHcpEditor'
import type { UseResumenBoardReturn } from '../hooks/useResumenBoard'
import { ResumenTab } from './ResumenTab'

function fila(id: string, name: string, hcpDisplay: number): Player {
  return { id, name, hcpDisplay, holes: 0, status: 'live', scores: [] } as unknown as Player
}

function board(rows: Player[]): UseResumenBoardReturn {
  return {
    loading: false,
    error: false,
    rows,
    cards: { conScore: 0, totalJugadores: rows.length, completos: 0, mejorGross: null, mejorNeto: null },
    reload: vi.fn(),
  } as unknown as UseResumenBoardReturn
}

function editor(over: Partial<UseHcpEditorReturn> = {}): UseHcpEditorReturn {
  return {
    editingId: null,
    editValue: '',
    setEditValue: vi.fn(),
    startEdit: vi.fn(),
    cancel: vi.fn(),
    save: vi.fn(),
    rango: RANGO_INDICE,
    ...over,
  }
}

function jugador(id: string, handicap_at_registration: number | null): ScoringPlayer {
  return { id, handicap_at_registration } as unknown as ScoringPlayer
}

describe('ResumenTab · handicap', () => {
  it('un plus se muestra con signo +, nunca como el negativo que guarda la base', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -2), fila('p2', 'Beto', 12.4)])}
        roster={[jugador('p1', -2), jugador('p2', 12.4)]}
        hcpEditor={editor()}
      />,
    )
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.queryByText('-2')).toBeNull()
    expect(screen.getByText('12.4')).toBeTruthy()
  })

  it('sin handicap en el roster cae al del board, y sin ninguno muestra "--"', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -3)])}
        roster={[jugador('p1', null)]}
        hcpEditor={editor()}
      />,
    )
    expect(screen.getByText('+3')).toBeTruthy()
  })

  it('el input toma min/max del rango del hook: el stepper baja a los plus', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -2)])}
        roster={[jugador('p1', -2)]}
        hcpEditor={editor({ editingId: 'p1', editValue: '-2' })}
      />,
    )
    const input = screen.getByRole('spinbutton')
    expect(input.getAttribute('min')).toBe(String(RANGO_INDICE.min))
    expect(input.getAttribute('max')).toBe(String(RANGO_INDICE.max))
  })

  it('en un torneo raw el input toma el rango del course handicap, no el de índice', () => {
    const raw: RangoHandicap = { min: -10, max: 64, guarda: 'course_handicap' }
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', 60)])}
        roster={[jugador('p1', 60)]}
        hcpEditor={editor({ editingId: 'p1', editValue: '60', rango: raw })}
      />,
    )
    expect(screen.getByRole('spinbutton').getAttribute('max')).toBe('64')
  })
})
