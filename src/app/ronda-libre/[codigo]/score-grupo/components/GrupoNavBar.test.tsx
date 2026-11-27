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

// «Terminar mi equipo» (27-nov): un celular por equipo, todos (creador incluido) terminan su equipo; nadie «finaliza».
describe('GrupoNavBar — un celular por equipo', () => {
  const pintar = (idx: number, isLastHole: boolean, finalizing = false) => {
    const onFinalize = vi.fn()
    render(
      <GrupoNavBar
        currentHoleIdx={idx} isLastHole={isLastHole} canFinalize finalizing={finalizing} congelada={false} terminaEquipo
        onPrev={() => {}} onNext={() => {}} onFinalize={onFinalize} theme={SCORER_THEME}
      />,
    )
    return onFinalize
  }
  it('último hoyo: «Terminar mi equipo» en el lugar de Finalizar, primario y ≥44 px; nunca Finalizar ni «Guardar hoyo»', () => {
    const onFinalize = pintar(17, true)
    const boton = screen.getByRole('button', { name: 'Terminar mi equipo' })
    expect(boton.textContent).toBe('Terminar mi equipo')
    expect(parseInt(boton.style.minHeight)).toBeGreaterThanOrEqual(44)
    expect(screen.queryByRole('button', { name: /Finalizar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Guardar hoyo/ })).toBeNull()
    fireEvent.click(boton)
    expect(onFinalize).toHaveBeenCalledTimes(1)
  })
  it('con tres botones, corto («Terminar») con el nombre completo; en curso, «Terminando…»', () => {
    pintar(9, false)
    expect(screen.getByRole('button', { name: 'Terminar mi equipo' }).textContent).toBe('Terminar')
  })
  it('terminando: deshabilitado', () => {
    pintar(17, true, true)
    const b = screen.getByRole('button', { name: 'Terminando…' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
  })
})

// Juanjo (26-nov): desde el hoyo 9 la barra partía en dos líneas (Anterior · Siguiente · Finalizar ronda ✓).
describe('GrupoNavBar — tres botones en una línea', () => {
  const pintar = (idx: number, isLastHole: boolean, canFinalize: boolean) => render(
    <GrupoNavBar
      currentHoleIdx={idx} isLastHole={isLastHole} canFinalize={canFinalize} finalizing={false} congelada={false}
      onPrev={() => {}} onNext={() => {}} onFinalize={() => {}} theme={SCORER_THEME}
    />,
  )
  it('con tres: Anterior solo flecha y Finalizar corto, con sus nombres completos; nada parte el texto', () => {
    pintar(9, false, true)
    const anterior = screen.getByRole('button', { name: 'Anterior' })
    const finalizar = screen.getByRole('button', { name: 'Finalizar ronda' })
    expect(anterior.textContent).toBe('←')
    expect(finalizar.textContent).toBe('Finalizar')
    for (const b of screen.getAllByRole('button')) {
      expect(b.style.whiteSpace).toBe('nowrap')
      expect(parseInt(b.style.minHeight)).toBeGreaterThanOrEqual(44)
    }
  })
  it('con dos (antes del 9, o en el último hoyo): los textos de siempre', () => {
    pintar(4, false, false)
    expect(screen.getByRole('button', { name: /Anterior/ }).textContent).toBe('← Anterior')
  })
  it('último hoyo: «Finalizar ronda ✓» completo', () => {
    pintar(17, true, true)
    expect(screen.getByRole('button', { name: 'Finalizar ronda' }).textContent).toBe('Finalizar ronda ✓')
  })
})
