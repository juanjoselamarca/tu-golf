import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCampoHandicap } from './useCampoHandicap'

describe('useCampoHandicap', () => {
  it('precarga un plus (−2) como "+2"', () => {
    const { result } = renderHook(() => useCampoHandicap(-2, vi.fn()))
    expect(result.current.texto).toBe('+2')
  })

  it.each([['+1.5', -1.5], ['18,5', 18.5], ['', null], ['+', null], ['abc', null]])(
    'tipear "%s" le pasa %s al padre', (texto, valor) => {
      const onValor = vi.fn()
      const { result } = renderHook(() => useCampoHandicap(10, onValor))
      act(() => result.current.onTexto(texto))
      expect(onValor).toHaveBeenLastCalledWith(valor)
      expect(result.current.texto).toBe(texto)
    })

  it('solo "abc" queda inválido (para el aviso); "+" a medio escribir no', () => {
    const { result } = renderHook(() => useCampoHandicap(null, vi.fn()))
    act(() => result.current.onTexto('+'))
    expect(result.current.invalido).toBe(false)
    act(() => result.current.onTexto('abc'))
    expect(result.current.invalido).toBe(true)
  })

  it('si el padre cambia el valor desde afuera, el texto lo sigue', () => {
    const { result, rerender } = renderHook(({ v }) => useCampoHandicap(v, vi.fn()), { initialProps: { v: null as number | null } })
    rerender({ v: -3 })
    expect(result.current.texto).toBe('+3')
  })

  it('el eco del propio tipeo no pisa lo escrito ("12." sigue "12." con el padre en 12)', () => {
    let valor: number | null = null
    const { result, rerender } = renderHook(() => useCampoHandicap(valor, v => { valor = v }))
    act(() => result.current.onTexto('12.'))
    rerender()
    expect(result.current.texto).toBe('12.')
    act(() => result.current.onTexto('+'))
    rerender()
    expect(result.current.texto).toBe('+')
  })
})
