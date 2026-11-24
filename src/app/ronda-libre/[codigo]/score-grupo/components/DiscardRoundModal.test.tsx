import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DiscardRoundModal } from './DiscardRoundModal'

// P0 24-nov: con la tarjeta congelada (finalizando) «Descartar ronda» borraba la ronda en pleno cierre.
describe('DiscardRoundModal', () => {
  it('con la tarjeta congelada el botón no abre la hoja y «Sí, descartar» no descarta', () => {
    const setShowConfirm = vi.fn()
    const onDiscard = vi.fn()
    render(<DiscardRoundModal showConfirm setShowConfirm={setShowConfirm} discarding={false} bloqueado onDiscard={onDiscard} />)
    const boton = screen.getByRole('button', { name: 'Descartar ronda' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(setShowConfirm).not.toHaveBeenCalledWith(true)
    const si = screen.getByRole('button', { name: 'Sí, descartar' }) as HTMLButtonElement
    expect(si.disabled).toBe(true)
    fireEvent.click(si)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('inverso: sin congelar, el botón abre la hoja y «Sí, descartar» descarta', () => {
    const setShowConfirm = vi.fn()
    const onDiscard = vi.fn()
    const { rerender } = render(<DiscardRoundModal showConfirm={false} setShowConfirm={setShowConfirm} discarding={false} bloqueado={false} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar ronda' }))
    expect(setShowConfirm).toHaveBeenCalledWith(true)
    rerender(<DiscardRoundModal showConfirm setShowConfirm={setShowConfirm} discarding={false} bloqueado={false} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
