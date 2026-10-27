import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScorerNavBar } from './ScorerNavBar'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderBar(finalizando: boolean) {
  const onPrev = vi.fn()
  const onNext = vi.fn()
  render(
    <ScorerNavBar
      currentHoleIdx={9} isLastHole={false} canFinalize confirmFinalize={false} finalizando={finalizando}
      missingCount={8} holesPlayed={10} totalHoles={18}
      onPrev={onPrev} onNext={onNext} onFinalize={() => {}} theme={SCORER_THEME}
    />,
  )
  return { onPrev, onNext }
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

  it('sin Finalizar en curso, navegan', () => {
    const { onPrev, onNext } = renderBar(false)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente hoyo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoyo anterior' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).toHaveBeenCalledTimes(1)
  })
})
