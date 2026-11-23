// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmarFinalizarHoja } from './ConfirmarFinalizarHoja'

afterEach(cleanup)

function montar() {
  const onConfirmar = vi.fn()
  const onCancelar = vi.fn()
  render(<ConfirmarFinalizarHoja titulo="¿Finalizar ronda?" onConfirmar={onConfirmar} onCancelar={onCancelar} />)
  return { onConfirmar, onCancelar }
}

describe('ConfirmarFinalizarHoja', () => {
  it('es un diálogo con la pregunta como nombre', () => {
    montar()
    expect(screen.getByRole('dialog', { name: '¿Finalizar ronda?' })).toBeTruthy()
  })

  it('Finalizar confirma y no cancela', () => {
    const { onConfirmar, onCancelar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    expect(onCancelar).not.toHaveBeenCalled()
  })

  it('Cancelar, tocar el fondo o Escape cancelan sin confirmar', () => {
    const { onConfirmar, onCancelar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByTestId('confirmar-finalizar-fondo'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancelar).toHaveBeenCalledTimes(3)
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('el foco entra en Finalizar y vuelve al botón que abrió la hoja', () => {
    const abrir = document.createElement('button')
    document.body.appendChild(abrir)
    abrir.focus()
    const { unmount } = render(<ConfirmarFinalizarHoja titulo="¿Finalizar ronda?" onConfirmar={() => {}} onCancelar={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Finalizar' }))
    unmount()
    expect(document.activeElement).toBe(abrir)
    abrir.remove()
  })

  it('tocar dentro de la hoja no la cierra', () => {
    const { onCancelar } = montar()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancelar).not.toHaveBeenCalled()
  })

  // `pointer-events` se hereda: la hoja lo pone en la capa que envuelve sus botones.
  it('Finalizar no recibe toques hasta pasado el doble toque que abrió la hoja', () => {
    vi.useFakeTimers()
    try {
      montar()
      const capa = screen.getByRole('button', { name: 'Finalizar' }).parentElement!
      expect(capa.style.pointerEvents).toBe('none')
      act(() => { vi.advanceTimersByTime(399) })
      expect(capa.style.pointerEvents).toBe('none')
      act(() => { vi.advanceTimersByTime(1) })
      expect(capa.style.pointerEvents).toBe('auto')
    } finally {
      vi.useRealTimers()
    }
  })
})
