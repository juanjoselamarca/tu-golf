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

describe('ScoringHeader · rechazos de otras tarjetas', () => {
  it('el chip ofrece descartar los rechazos de tarjetas cerradas sólo cuando los hay', () => {
    const onDescartarOtras = vi.fn()
    const aviso = { ...base, avisoPendientes: '1 hoyo no se guardó (Ana)', hayRechazo: true, saving: false, lastAction: null, onUndo: vi.fn() }
    const { rerender } = render(<ScoringHeader {...aviso} onDescartarOtras={onDescartarOtras} />)
    const boton = screen.getByRole('button', { name: 'Descartar los de otras tarjetas' })
    expect(parseInt(boton.style.minHeight)).toBeGreaterThanOrEqual(44)
    fireEvent.click(boton)
    expect(onDescartarOtras).toHaveBeenCalledTimes(1)
    rerender(<ScoringHeader {...aviso} onDescartarOtras={null} />)
    expect(screen.queryByRole('button', { name: 'Descartar los de otras tarjetas' })).toBeNull()
  })
})
