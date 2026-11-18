import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useToast } from '../useToast'

describe('useToast', () => {
  it('devuelve las mismas funciones en cada render (seguras como dependencia de un efecto)', () => {
    const { result, rerender } = renderHook(() => useToast())
    const primero = result.current
    rerender()
    expect(result.current).toBe(primero)
    expect(result.current.showError).toBe(primero.showError)
  })
})
