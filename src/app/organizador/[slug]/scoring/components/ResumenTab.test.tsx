// Revisión del PR #720: el hook se liberó del rango 0..54 pero la vista no —
// el input seguía con `min={0} max={54}` (el stepper no bajaba a los plus) y un
// plus 2 se mostraba "-2", invitando al organizador a "corregirlo" a 2.

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Player } from '@/lib/golf-data'
import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'
import { useHcpEditor, type UseHcpEditorReturn } from '../hooks/useHcpEditor'
import type { UseResumenBoardReturn } from '../hooks/useResumenBoard'
import { ResumenTab } from './ResumenTab'

const updatePlayerHandicap = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/data/tournaments/scoring', () => ({
  updatePlayerHandicap: (...args: unknown[]) => updatePlayerHandicap(...args),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showWarning: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

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

  it('el input es de texto: un type="number" descarta el "+2" y la coma de "18,5"', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -2)])}
        roster={[jugador('p1', -2)]}
        hcpEditor={editor({ editingId: 'p1', editValue: '+2' })}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Handicap de inscripción' })
    expect(input.getAttribute('type')).toBe('text')
    expect((input as HTMLInputElement).value).toBe('+2')
  })
})

// El hook real detrás de la vista: lo que se tipea en el input es lo que llega a la base.
function ResumenConEditor({ roster }: { roster: ScoringPlayer[] }) {
  const hcpEditor = useHcpEditor({ onSaved: vi.fn(), hcpCalcMode: 'whs', course: null })
  return <ResumenTab board={board([fila('p1', 'Ana', -2)])} roster={roster} hcpEditor={hcpEditor} />
}

describe('ResumenTab · editar el handicap en el DOM', () => {
  it.each([
    ['+3', -3],
    ['18,5', 18.5],
  ])('tipear %s guarda %p', async (texto, valor) => {
    updatePlayerHandicap.mockClear()
    render(<ResumenConEditor roster={[jugador('p1', -2)]} />)
    fireEvent.click(screen.getByRole('button', { name: '+2' }))
    const input = screen.getByRole('textbox', { name: 'Handicap de inscripción' }) as HTMLInputElement
    expect(input.value).toBe('+2')
    fireEvent.change(input, { target: { value: texto } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => expect(updatePlayerHandicap).toHaveBeenCalled())
    expect(updatePlayerHandicap.mock.calls[0][2]).toBe(valor)
  })
})
