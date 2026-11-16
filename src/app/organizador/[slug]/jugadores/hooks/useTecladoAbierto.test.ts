// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { abreTeclado, useTecladoAbierto } from './useTecladoAbierto'

function simularPantalla(tactil: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: tactil && q === '(pointer: coarse)', media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function campo(html: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const el = wrap.firstElementChild as HTMLElement
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('abreTeclado', () => {
  it('texto, búsqueda, número y textarea abren el teclado', () => {
    expect(abreTeclado(campo('<input type="text">'))).toBe(true)
    expect(abreTeclado(campo('<input>'))).toBe(true)
    expect(abreTeclado(campo('<input type="search">'))).toBe(true)
    expect(abreTeclado(campo('<input type="number">'))).toBe(true)
    expect(abreTeclado(campo('<textarea></textarea>'))).toBe(true)
  })

  it('select, checkbox, botón y el body no lo abren', () => {
    expect(abreTeclado(campo('<select><option>a</option></select>'))).toBe(false)
    expect(abreTeclado(campo('<input type="checkbox">'))).toBe(false)
    expect(abreTeclado(campo('<button>x</button>'))).toBe(false)
    expect(abreTeclado(document.body)).toBe(false)
    expect(abreTeclado(null)).toBe(false)
  })
})

describe('useTecladoAbierto', () => {
  it('en pantalla táctil: abierto mientras un campo de texto tiene foco', () => {
    vi.useFakeTimers()
    simularPantalla(true)
    const input = campo('<input type="text">')
    const { result } = renderHook(() => useTecladoAbierto())
    expect(result.current).toBe(false)

    act(() => { input.focus() })
    expect(result.current).toBe(true)

    act(() => { input.blur(); vi.runAllTimers() })
    expect(result.current).toBe(false)
  })

  it('pasar de un campo a otro no lo cierra', () => {
    vi.useFakeTimers()
    simularPantalla(true)
    const a = campo('<input type="text">')
    const b = campo('<textarea></textarea>')
    const { result } = renderHook(() => useTecladoAbierto())
    act(() => { a.focus() })
    act(() => { b.focus(); vi.runAllTimers() })
    expect(result.current).toBe(true)
  })

  describe('con visualViewport (exige que el viewport se haya achicado)', () => {
    function simularViewport(alto: number) {
      const listeners: Array<() => void> = []
      const vv = {
        height: alto,
        width: 390,
        scale: 1,
        addEventListener: (_: string, fn: () => void) => { listeners.push(fn) },
        removeEventListener: vi.fn(),
      }
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: alto, configurable: true })
      const avisar = () => listeners.forEach((fn) => fn())
      return {
        cambiarAlto(h: number) { vv.height = h; avisar() },
        /** Zoom de pellizco: el viewport visible se achica en CSS px, sin teclado. */
        zoom(escala: number) { vv.scale = escala; vv.height = alto / escala; vv.width = 390 / escala; avisar() },
        /** Giro a horizontal sin teclado: cambia ancho y alto (y innerHeight). */
        girar(ancho: number, h: number) {
          Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
          vv.width = ancho; vv.height = h; avisar()
        },
      }
    }
    afterEach(() => {
      Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    })

    it('foco sin teclado visible (viewport completo) no esconde la barra', () => {
      simularPantalla(true)
      simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus() })
      expect(result.current).toBe(false)
    })

    it('foco + viewport achicado = abierto; cerrar el teclado con "atrás" (foco sigue) = cerrado', () => {
      simularPantalla(true)
      const vp = simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus(); vp.cambiarAlto(500) })
      expect(result.current).toBe(true)
      act(() => { vp.cambiarAlto(844) })
      expect(document.activeElement).toBe(input)
      expect(result.current).toBe(false)
    })

    it('si el campo con foco se desmonta, la barra vuelve al cerrarse el teclado', () => {
      simularPantalla(true)
      const vp = simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus(); vp.cambiarAlto(500) })
      expect(result.current).toBe(true)
      act(() => { input.remove(); vp.cambiarAlto(844) })
      expect(result.current).toBe(false)
    })

    it('girar a horizontal con foco y sin teclado no esconde la barra; con teclado sí', () => {
      simularPantalla(true)
      const vp = simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus() })
      act(() => { vp.girar(844, 360) })
      expect(result.current).toBe(false)
      act(() => { vp.cambiarAlto(150) })
      expect(result.current).toBe(true)
    })

    it('girar con innerHeight todavía viejo (llega después) tampoco esconde la barra', () => {
      simularPantalla(true)
      const vp = simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus() })
      act(() => {
        vp.girar(844, 360)
        Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true })
        vp.cambiarAlto(360)
      })
      expect(result.current).toBe(false)
    })

    it('el zoom de pellizco con foco no cuenta como teclado', () => {
      simularPantalla(true)
      const vp = simularViewport(844)
      const input = campo('<input type="text">')
      const { result } = renderHook(() => useTecladoAbierto())
      act(() => { input.focus(); vp.zoom(1.5) })
      expect(result.current).toBe(false)
    })

    it('un input desconectado del documento no cuenta como campo con teclado', () => {
      const input = document.createElement('input')
      expect(abreTeclado(input)).toBe(false)
    })
  })

  it('en escritorio (puntero fino) nunca se marca abierto', () => {
    simularPantalla(false)
    const input = campo('<input type="text">')
    const { result } = renderHook(() => useTecladoAbierto())
    act(() => { input.focus() })
    expect(result.current).toBe(false)
  })
})
