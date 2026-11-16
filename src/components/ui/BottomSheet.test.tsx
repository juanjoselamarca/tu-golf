import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
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

  it('el fondo usa el token --scrim (no un color fijo)', () => {
    pintar()
    expect(screen.getByTestId('bottom-sheet-fondo').style.background).toBe('var(--scrim)')
  })

  it('trampa de foco: Tab y Shift+Tab ciclan dentro de la hoja', () => {
    render(
      <>
        <button type="button">Fondo</button>
        <BottomSheet abierto onCerrar={vi.fn()} etiqueta="Prueba">
          <button type="button">Uno</button>
          <button type="button">Dos</button>
        </BottomSheet>
      </>,
    )
    const uno = screen.getByText('Uno')
    const dos = screen.getByText('Dos')
    fireEvent.keyDown(document, { key: 'Tab' }) // desde la hoja recién abierta entra por el primero
    expect(document.activeElement).toBe(uno)
    dos.focus()
    fireEvent.keyDown(document, { key: 'Tab' }) // del último vuelve al primero, nunca al fondo
    expect(document.activeElement).toBe(uno)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }) // del primero, hacia atrás, al último
    expect(document.activeElement).toBe(dos)
  })

  it('al cerrar, el foco vuelve al botón que la abrió; un re-render del padre no le roba el foco', () => {
    function ConDisparador() {
      const [abierto, setAbierto] = useState(false)
      const [, forzar] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>Abrir</button>
          <BottomSheet abierto={abierto} onCerrar={() => setAbierto(false)} etiqueta="Prueba">
            <button type="button" onClick={() => forzar(n => n + 1)}>Re-render</button>
          </BottomSheet>
        </>
      )
    }
    render(<ConDisparador />)
    const abrir = screen.getByText('Abrir')
    abrir.focus()
    fireEvent.click(abrir)
    const rerender = screen.getByText('Re-render')
    rerender.focus()
    fireEvent.click(rerender)
    expect(document.activeElement).toBe(rerender)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(abrir)
  })
})
