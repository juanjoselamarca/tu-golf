import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GrupoNavBar, envioDelHoyo } from './GrupoNavBar'
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
  const renderUltimo = (guardado: boolean, envio?: 'al_dia' | 'enviando' | 'pendiente') => {
    const onGuardar = vi.fn()
    render(
      <GrupoNavBar
        currentHoleIdx={17} isLastHole canFinalize={false} finalizing={false} congelada={false}
        onPrev={() => {}} onNext={() => {}} onFinalize={() => {}} theme={SCORER_THEME}
        guardarUltimoHoyo={{ hoyo: 18, guardado, envio, onGuardar }}
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

  it('anotado pero sin señal: nunca «anotado ✓»; «Enviar hoyo 18» activo reintenta el envío', () => {
    const { onGuardar } = renderUltimo(true, 'pendiente')
    expect(screen.queryByRole('button', { name: /anotado/ })).toBeNull()
    const boton = screen.getByRole('button', { name: 'Enviar hoyo 18' }) as HTMLButtonElement
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)
    expect(onGuardar).toHaveBeenCalledTimes(1)
  })

  it('anotado y en viaje: «Enviando hoyo 18…», sin repetir el toque', () => {
    const { onGuardar } = renderUltimo(true, 'enviando')
    const boton = screen.getByRole('button', { name: 'Enviando hoyo 18…' }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    fireEvent.click(boton)
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('sin anotar y con el envío en viaje (otro hoyo): sigue «Guardar hoyo 18» activo', () => {
    renderUltimo(false, 'enviando')
    expect((screen.getByRole('button', { name: 'Guardar hoyo 18' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('envioDelHoyo: la cola del teléfono manda (reabrir sin señal con pendientes ≠ «al día»)', () => {
    expect(envioDelHoyo({ enviando: false, fallo: false, colaConPendientes: true })).toBe('pendiente')
    expect(envioDelHoyo({ enviando: false, fallo: true, colaConPendientes: false })).toBe('pendiente')
    expect(envioDelHoyo({ enviando: true, fallo: true, colaConPendientes: true })).toBe('enviando')
    expect(envioDelHoyo({ enviando: false, fallo: false, colaConPendientes: false })).toBe('al_dia')
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
