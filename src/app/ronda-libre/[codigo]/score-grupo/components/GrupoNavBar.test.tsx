import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GrupoNavBar } from './GrupoNavBar'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderBar(congelada: boolean) {
  const onFinalize = vi.fn()
  render(
    <GrupoNavBar
      currentHoleIdx={8} isLastHole canFinalize finalizing={false} congelada={congelada}
      onPrev={() => {}} onNext={() => {}} onFinalize={onFinalize} theme={SCORER_THEME}
    />,
  )
  return { onFinalize, boton: screen.getByRole('button', { name: /Finalizar ronda/ }) as HTMLButtonElement }
}

// Revisión P2-a (24-nov): con «Descartando…» (tarjeta congelada) Finalizar no daba señal; ahora se ve deshabilitado.
describe('GrupoNavBar', () => {
  it('con la tarjeta congelada Finalizar queda deshabilitado', () => {
    const { onFinalize, boton } = renderBar(true)
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(onFinalize).not.toHaveBeenCalled()
  })

  it('inverso: sin congelar, Finalizar responde', () => {
    const { onFinalize, boton } = renderBar(false)
    fireEvent.click(boton)
    expect(onFinalize).toHaveBeenCalledTimes(1)
  })
})
