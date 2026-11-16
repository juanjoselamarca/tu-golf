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

  it('en escritorio (puntero fino) nunca se marca abierto', () => {
    simularPantalla(false)
    const input = campo('<input type="text">')
    const { result } = renderHook(() => useTecladoAbierto())
    act(() => { input.focus() })
    expect(result.current).toBe(false)
  })
})
