import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEstadoConRef } from './useEstadoConRef'

describe('useEstadoConRef', () => {
  it('arranca con el valor inicial en el estado y en la ref', () => {
    const { result } = renderHook(() => useEstadoConRef({ a: 1 }))
    expect(result.current[0]).toEqual({ a: 1 })
    expect(result.current[2].current).toEqual({ a: 1 })
  })

  it('con un valor: la ref cambia en el acto (antes del render) y el estado tras el render', () => {
    const { result } = renderHook(() => useEstadoConRef(0))
    let leidaEnElActo = -1
    act(() => {
      result.current[1](5)
      leidaEnElActo = result.current[2].current
    })
    expect(leidaEnElActo).toBe(5)
    expect(result.current[0]).toBe(5)
  })

  it('updaters encadenados en el mismo tick: cada uno parte del anterior (ninguno se pierde)', () => {
    const { result } = renderHook(() => useEstadoConRef<number[]>([]))
    const vistos: number[][] = []
    act(() => {
      const set = result.current[1]
      set(prev => [...prev, 1])
      vistos.push(result.current[2].current)
      set(prev => [...prev, 2])
      set(5 > 0 ? prev => [...prev, 3] : [])
    })
    expect(vistos).toEqual([[1]])
    expect(result.current[0]).toEqual([1, 2, 3])
    expect(result.current[2].current).toEqual([1, 2, 3])
  })

  it('mezcla de valor y updater en el mismo tick: el updater parte del valor recién puesto', () => {
    const { result } = renderHook(() => useEstadoConRef(1))
    act(() => {
      result.current[1](10)
      result.current[1](n => n + 1)
    })
    expect(result.current[0]).toBe(11)
  })

  it('el setter y la ref tienen identidad estable entre renders', () => {
    const { result, rerender } = renderHook(() => useEstadoConRef('x'))
    const [, set0, ref0] = result.current
    act(() => { set0('y') })
    rerender()
    expect(result.current[1]).toBe(set0)
    expect(result.current[2]).toBe(ref0)
    expect(result.current[0]).toBe('y')
  })
})
