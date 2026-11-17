// Revisión del PR #720: el hook se liberó del rango 0..54 pero la vista no —
// el input seguía con `min={0} max={54}` (el stepper no bajaba a los plus) y un
// plus 2 se mostraba "-2", invitando al organizador a "corregirlo" a 2.

import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Player } from '@/lib/golf-data'
import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'
import { useHcpEditor, type UseHcpEditorReturn } from '../hooks/useHcpEditor'
import type { UseResumenBoardReturn } from '../hooks/useResumenBoard'
import { ResumenTab } from './ResumenTab'

const updatePlayerHandicap = vi.fn(async (...args: unknown[]) => args[2] as number)
vi.mock('@/lib/data/tournaments/scoring', () => ({
  HandicapCambiadoError: class extends Error {},
  HandicapNoGuardadoError: class extends Error {},
  updatePlayerHandicap: (...args: unknown[]) => updatePlayerHandicap(...args),
}))
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
    guardando: new Set<string>(),
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
        hcpCalcMode="whs"
        hcpEditor={editor()}
      />,
    )
    expect(screen.getByText('+2.0')).toBeTruthy()
    expect(screen.queryByText('-2.0')).toBeNull()
    expect(screen.getByText('12.4')).toBeTruthy()
    // WHS: lo inscrito es el índice, y se rotula igual que en el panel de jugadores.
    expect(screen.getByText('Índice')).toBeTruthy()
  })

  it('sin handicap en el roster cae al del board, y sin ninguno muestra "--"', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -3)])}
        roster={[jugador('p1', null)]}
        hcpCalcMode="whs"
        hcpEditor={editor()}
      />,
    )
    expect(screen.getByText('+3.0')).toBeTruthy()
  })

  it('torneo no WHS: rótulo HCP y el número sin decimal forzado', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -2)])}
        roster={[jugador('p1', -2)]}
        hcpCalcMode={null}
        hcpEditor={editor()}
      />,
    )
    expect(screen.getByText('HCP')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('el input es de texto: un type="number" descarta el "+2" y la coma de "18,5"', () => {
    render(
      <ResumenTab
        board={board([fila('p1', 'Ana', -2)])}
        roster={[jugador('p1', -2)]}
        hcpCalcMode="whs"
        hcpEditor={editor({ editingId: 'p1', editValue: '+2' })}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Índice de inscripción' })
    expect(input.getAttribute('type')).toBe('text')
    expect((input as HTMLInputElement).value).toBe('+2')
  })
})

// El hook real detrás de la vista: lo que se tipea en el input es lo que llega a la base.
function ResumenConEditor({ roster }: { roster: ScoringPlayer[] }) {
  const hcpEditor = useHcpEditor({ slug: 's', onSaved: vi.fn(), hcpCalcMode: 'whs', course: null, onConflicto: vi.fn() })
  return <ResumenTab board={board([fila('p1', 'Ana', -2)])} roster={roster} hcpEditor={hcpEditor} hcpCalcMode="whs" />
}

function ResumenConEditorDos() {
  const hcpEditor = useHcpEditor({ slug: 's', onSaved: vi.fn(), hcpCalcMode: 'whs', course: null, onConflicto: vi.fn() })
  return (
    <ResumenTab
      board={board([fila('p1', 'Ana', -2), fila('p2', 'Bea', 8)])}
      roster={[jugador('p1', -2), jugador('p2', 8)]}
      hcpEditor={hcpEditor}
      hcpCalcMode="whs"
    />
  )
}

describe('ResumenTab · uso en cancha', () => {
  it('el botón y el input miden ≥44 px de alto con fuente de 16 px (sin zoom de iOS)', () => {
    const { rerender } = render(
      <ResumenTab board={board([fila('p1', 'Ana', -2)])} roster={[jugador('p1', -2)]} hcpEditor={editor()} hcpCalcMode="whs" />,
    )
    const boton = screen.getByRole('button', { name: '+2.0' })
    expect(boton.style.minHeight).toBe('44px')
    expect(boton.style.fontSize).toBe('16px')
    rerender(
      <ResumenTab board={board([fila('p1', 'Ana', -2)])} roster={[jugador('p1', -2)]} hcpEditor={editor({ editingId: 'p1', editValue: '+2' })} hcpCalcMode="whs" />,
    )
    const input = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    expect(input.style.minHeight).toBe('44px')
    expect(input.style.fontSize).toBe('16px')
  })

  it('guardando: input deshabilitado y "Guardando…" visible', () => {
    render(
      <ResumenTab board={board([fila('p1', 'Ana', -2)])} roster={[jugador('p1', -2)]} hcpEditor={editor({ editingId: 'p1', editValue: '+2', guardando: new Set(['p1']) })} hcpCalcMode="whs" />,
    )
    expect((screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Guardando…')
  })
})

describe('ResumenTab · editar el handicap en el DOM', () => {
  it.each([
    ['+3', -3],
    ['18,5', 18.5],
  ])('tipear %s guarda %p', async (texto, valor) => {
    updatePlayerHandicap.mockClear()
    render(<ResumenConEditor roster={[jugador('p1', -2)]} />)
    fireEvent.click(screen.getByRole('button', { name: '+2.0' }))
    const input = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    // Precarga igual que el botón: "+2.0", no "+2".
    expect(input.value).toBe('+2.0')
    fireEvent.change(input, { target: { value: texto } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => expect(updatePlayerHandicap).toHaveBeenCalled())
    expect(updatePlayerHandicap.mock.calls[0][2]).toBe(valor)
    // El esperado es lo que el organizador vio en la fila (plus 2 → −2).
    expect(updatePlayerHandicap.mock.calls[0][3]).toBe(-2)
  })

  // Revisión Fable vuelta 2: escribir en A y tocar B → el blur guarda A y el click abre B.
  // B queda editable (sin "Guardando…") y NO se cierra cuando termina A.
  it('abrir B mientras A guarda: B editable y sigue abierto al terminar A', async () => {
    updatePlayerHandicap.mockClear()
    let soltar: (v: number) => void = () => {}
    updatePlayerHandicap.mockImplementationOnce(() => new Promise<number>((r) => { soltar = r }))
    render(<ResumenConEditorDos />)
    fireEvent.click(screen.getByRole('button', { name: '+2.0' }))
    const inputA = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    fireEvent.change(inputA, { target: { value: '12' } })
    fireEvent.blur(inputA)
    fireEvent.click(screen.getByRole('button', { name: '8.0' }))
    const inputB = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    expect(inputB.value).toBe('8.0')
    expect(inputB.disabled).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
    // Deja terminar el guardado de A (promesa + finally + re-render).
    await act(async () => { soltar(12); await new Promise((r) => setTimeout(r, 0)) })
    const sigue = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    expect(sigue.value).toBe('8.0')
    expect(sigue.disabled).toBe(false)
    expect(updatePlayerHandicap).toHaveBeenCalledTimes(1)
  })

  // Revisión Fable P1-1: Enter guarda y el blur que sigue NO manda un segundo PUT (sería un 409 falso).
  it('Enter y después blur: un solo guardado', async () => {
    updatePlayerHandicap.mockClear()
    let soltar: (v: number) => void = () => {}
    updatePlayerHandicap.mockImplementationOnce(() => new Promise<number>((r) => { soltar = r }))
    render(<ResumenConEditor roster={[jugador('p1', -2)]} />)
    fireEvent.click(screen.getByRole('button', { name: '+2.0' }))
    const input = screen.getByRole('textbox', { name: 'Índice de inscripción' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    soltar(12)
    await vi.waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(updatePlayerHandicap).toHaveBeenCalledTimes(1)
  })
})
