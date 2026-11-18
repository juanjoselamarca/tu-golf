import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScoringHeader } from './ScoringHeader'

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
