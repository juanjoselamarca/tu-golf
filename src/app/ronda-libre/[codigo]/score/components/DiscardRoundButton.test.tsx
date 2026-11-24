import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DiscardRoundButton } from './DiscardRoundButton'

// P0 24-nov: mientras se finaliza, «Descartar ronda» no se puede tocar (borraba la ronda en pleno cierre).
describe('DiscardRoundButton', () => {
  it('bloqueado (finalizando): deshabilitado, incluso con la confirmación armada', () => {
    const onClick = vi.fn()
    render(<DiscardRoundButton confirmDiscard discarding={false} bloqueado onClick={onClick} />)
    const boton = screen.getByRole('button', { name: 'Confirmar descarte' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('inverso: sin bloquear se puede tocar', () => {
    const onClick = vi.fn()
    render(<DiscardRoundButton confirmDiscard={false} discarding={false} bloqueado={false} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar ronda' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
