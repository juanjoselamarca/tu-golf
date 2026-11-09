// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('tocar dentro de la hoja no la cierra', () => {
    const { onCancelar } = montar()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancelar).not.toHaveBeenCalled()
  })

  it('Cancelar queda bajo Finalizar: un doble toque desde la barra inferior no cierra la ronda', () => {
    montar()
    const botones = screen.getAllByRole('button').map(b => b.textContent)
    expect(botones).toEqual(['Finalizar', 'Cancelar'])
  })
})
