import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScorerNavBar } from './ScorerNavBar'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderBar(finalizando: boolean, descartando = false) {
  const onPrev = vi.fn()
  const onNext = vi.fn()
  const onFinalize = vi.fn()
  render(
    <ScorerNavBar
      currentHoleIdx={9} isLastHole={false} canFinalize finalizando={finalizando} descartando={descartando}
      onPrev={onPrev} onNext={onNext} onFinalize={onFinalize} theme={SCORER_THEME}
    />,
  )
  return { onPrev, onNext, onFinalize }
}

describe('ScorerNavBar', () => {
  // Revisión del PR #588: desde el hoyo 9 Finalizar es secundario y Siguiente sigue a la vista. Siguiente auto-llena el
  // par del hoyo vacío y lo guarda; tocado durante "Finalizando..." ese guardado salía después de leer la tarjeta.
  it('con Finalizar en curso, Siguiente y Anterior no responden', () => {
    const { onPrev, onNext } = renderBar(true)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente hoyo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoyo anterior' }))
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
  })

  // Revisión P2-a (24-nov): con «Descartando…» Finalizar no daba señal; ahora se ve deshabilitado.
  it('descartando, Finalizar queda deshabilitado', () => {
    const { onFinalize } = renderBar(false, true)
    const boton = screen.getByRole('button', { name: 'Finalizar ronda' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(onFinalize).not.toHaveBeenCalled()
  })

  it('inverso: sin descartar, Finalizar responde', () => {
    const { onFinalize } = renderBar(false, false)
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar ronda' }))
    expect(onFinalize).toHaveBeenCalledTimes(1)
  })

  it('sin Finalizar en curso, navegan', () => {
    const { onPrev, onNext } = renderBar(false)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente hoyo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoyo anterior' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).toHaveBeenCalledTimes(1)
  })
})
