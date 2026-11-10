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
  it('con valor NaN no entra en un render infinito (NaN !== NaN)', () => {
    const { result, rerender } = renderHook(({ v }) => useCampoHandicap(v, vi.fn()), { initialProps: { v: NaN as number | null } })
    rerender({ v: NaN })
    expect(typeof result.current.texto).toBe('string')
    rerender({ v: 12 })
    expect(result.current.texto).toBe('12')
  })

  it('bloquea a medio escribir o con texto inválido, y se lo avisa al padre (también al desmontarse)', () => {
    const onBloquea = vi.fn()
    const { result, unmount } = renderHook(() => useCampoHandicap(10, vi.fn(), onBloquea))
    expect(result.current.bloquea).toBe(false)
    expect(onBloquea).not.toHaveBeenCalled()
    act(() => result.current.onTexto('1O'))
    expect(result.current.bloquea).toBe(true)
    expect(onBloquea).toHaveBeenLastCalledWith(true)
    act(() => result.current.onTexto('+'))
    expect(result.current.bloquea).toBe(true)
    act(() => result.current.onTexto('10'))
    expect(result.current.bloquea).toBe(false)
    expect(onBloquea).toHaveBeenLastCalledWith(false)
    act(() => result.current.onTexto('abc'))
    expect(onBloquea).toHaveBeenLastCalledWith(true)
    unmount()
    expect(onBloquea).toHaveBeenLastCalledWith(false)
  })
})
