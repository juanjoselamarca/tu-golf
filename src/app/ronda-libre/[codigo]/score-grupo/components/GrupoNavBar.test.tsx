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

// Ensayo del scramble (25-nov), P0-1: quien anota un equipo desde su celular llegaba al último hoyo con solo «← Anterior».
describe('GrupoNavBar — último hoyo de quien no cierra la ronda', () => {
  const renderUltimo = (guardado: boolean) => {
    const onGuardar = vi.fn()
    render(
      <GrupoNavBar
        currentHoleIdx={17} isLastHole canFinalize={false} finalizing={false} congelada={false}
        onPrev={() => {}} onNext={() => {}} onFinalize={() => {}} theme={SCORER_THEME}
        guardarUltimoHoyo={{ hoyo: 18, guardado, onGuardar }}
      />,
    )
    return { onGuardar }
  }

  it('ofrece «Guardar hoyo 18» (≥44 px, primario) y nunca Finalizar', () => {
    const { onGuardar } = renderUltimo(false)
    const boton = screen.getByRole('button', { name: 'Guardar hoyo 18' }) as HTMLButtonElement
    expect(parseInt(boton.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    expect(screen.queryByRole('button', { name: /Finalizar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Siguiente/ })).toBeNull()
    fireEvent.click(boton)
    expect(onGuardar).toHaveBeenCalledTimes(1)
  })

  it('con el hoyo ya anotado dice «Hoyo 18 anotado» y no repite el guardado', () => {
    const { onGuardar } = renderUltimo(true)
    const boton = screen.getByRole('button', { name: /Hoyo 18 anotado/ }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('sin la acción (quien cierra la ronda): el último hoyo sigue con Finalizar, sin «Guardar hoyo»', () => {
    render(
      <GrupoNavBar
        currentHoleIdx={17} isLastHole canFinalize finalizing={false} congelada={false}
        onPrev={() => {}} onNext={() => {}} onFinalize={() => {}} theme={SCORER_THEME}
      />,
    )
    expect(screen.queryByRole('button', { name: /Guardar hoyo/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Finalizar ronda/ })).toBeTruthy()
  })
})
