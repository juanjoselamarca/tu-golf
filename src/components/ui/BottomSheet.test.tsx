import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'

const pintar = (onCerrar = vi.fn(), abierto = true) => {
  render(<BottomSheet abierto={abierto} onCerrar={onCerrar} etiqueta="Prueba"><button type="button">Adentro</button></BottomSheet>)
  return onCerrar
}

describe('BottomSheet', () => {
  it('cerrada no pinta nada', () => {
    pintar(vi.fn(), false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('abierta: diálogo modal con nombre y el foco adentro', () => {
    pintar()
    const d = screen.getByRole('dialog', { name: 'Prueba' })
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(d)
  })

  it('cierra tocando fuera, con Escape y deslizando hacia abajo más del umbral', () => {
    const cerrar = pintar()
    fireEvent.click(screen.getByTestId('bottom-sheet-fondo'))
    fireEvent.keyDown(document, { key: 'Escape' })
    const d = screen.getByRole('dialog')
    fireEvent.touchStart(d, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(d, { touches: [{ clientY: 150 }] })
    fireEvent.touchEnd(d)
    expect(cerrar).toHaveBeenCalledTimes(2) // un arrastre corto no cierra
    fireEvent.touchStart(d, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(d, { touches: [{ clientY: 260 }] })
    fireEvent.touchEnd(d)
    expect(cerrar).toHaveBeenCalledTimes(3)
  })

  it('tocar adentro no cierra', () => {
    const cerrar = pintar()
    fireEvent.click(screen.getByText('Adentro'))
    expect(cerrar).not.toHaveBeenCalled()
  })
})
