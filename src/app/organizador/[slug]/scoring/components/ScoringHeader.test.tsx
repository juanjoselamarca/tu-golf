import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PLAZO_CONFIRMAR_DESCARTE_MS, ScoringHeader } from './ScoringHeader'

const base = {
  name: 'Copa', slug: 'copa', status: 'in_progress', isMultiRound: false, activeRoundNum: 1, totalRounds: 1,
  avisoPendientes: null, hayRechazo: false, onReintentar: vi.fn(),
}
const accion = { id: 1, hole: 7, roundId: 'r1', playerId: 'p1', previo: null, nuevo: 5 }

describe('ScoringHeader · deshacer', () => {
  it('se puede deshacer con el guardado en vuelo (sale detrás) y el botón mide 44 px', () => {
    const onUndo = vi.fn()
    render(<ScoringHeader {...base} saving lastAction={accion} onUndo={onUndo} />)
    const boton = screen.getByRole('button', { name: 'Deshacer hoyo 7' })
    expect(parseInt(boton.style.minHeight)).toBeGreaterThanOrEqual(44)
    fireEvent.click(boton)
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})

describe('ScoringHeader · rechazos de otras tarjetas', () => {
  afterEach(() => { vi.useRealTimers() })
  const aviso = { ...base, avisoPendientes: '2 hoyos no se guardaron (Ana)', hayRechazo: true, saving: false, lastAction: null, onUndo: vi.fn() }

  it('nombra tarjetas y hoyos y pide dos toques: el primero sólo arma, el segundo descarta', () => {
    const onConfirmar = vi.fn()
    render(<ScoringHeader {...aviso} descartarOtras={{ detalle: 'Ana: hoyos 3, 4', onConfirmar }} />)
    const boton = screen.getByRole('button', { name: 'Descartar · Ana: hoyos 3, 4' })
    expect(parseInt(boton.style.minHeight)).toBeGreaterThanOrEqual(44)
    // Mutación anotada: descartar al primer toque → onConfirmar llamado acá y falla.
    fireEvent.click(boton)
    expect(onConfirmar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Toca de nuevo para descartar' }))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Descartar · Ana: hoyos 3, 4' })).toBeTruthy()
  })

  it('el primer toque vence a los 4 s: un toque después vuelve a armar, no descarta', () => {
    vi.useFakeTimers()
    const onConfirmar = vi.fn()
    render(<ScoringHeader {...aviso} descartarOtras={{ detalle: 'Ana: hoyo 3', onConfirmar }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar · Ana: hoyo 3' }))
    // Mutación anotada: sin el plazo, el botón queda armado y el toque de abajo descarta.
    act(() => { vi.advanceTimersByTime(PLAZO_CONFIRMAR_DESCARTE_MS) })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar · Ana: hoyo 3' }))
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('sin rechazos descartables en otras tarjetas no hay botón', () => {
    render(<ScoringHeader {...aviso} descartarOtras={null} />)
    expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull()
  })
})
