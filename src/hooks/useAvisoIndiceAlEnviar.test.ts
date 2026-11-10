// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAvisoIndiceAlEnviar } from './useAvisoIndiceAlEnviar'

const OPCIONAL_INDICE = { opcional: true, rango: 'indice' as const }

describe('useAvisoIndiceAlEnviar', () => {
  it.each(['-', '+', '.', ','])('"%s" a medio escribir: sin aviso en vivo; al enviar avisa, enfoca y no deja pasar', texto => {
    const input = document.createElement('input')
    input.id = 'campo-x'
    document.body.appendChild(input)
    const { result } = renderHook(() => useAvisoIndiceAlEnviar(texto, 'campo-x', OPCIONAL_INDICE))
    expect(result.current.aviso).toBeNull()
    let paso = true
    act(() => { paso = result.current.validarAlEnviar() })
    expect(paso).toBe(false)
    expect(result.current.aviso).toBe('Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.')
    expect(result.current.propsDelCampo).toEqual({ 'aria-invalid': true, 'aria-describedby': 'campo-x-error' })
    expect(document.activeElement).toBe(input)
    input.remove()
  })

  it('el aviso del envío se va al volver a escribir', () => {
    const { result, rerender } = renderHook(({ t }) => useAvisoIndiceAlEnviar(t, 'c', OPCIONAL_INDICE), { initialProps: { t: '+' } })
    act(() => { result.current.validarAlEnviar() })
    expect(result.current.aviso).not.toBeNull()
    rerender({ t: '+2' })
    expect(result.current.aviso).toBeNull()
    rerender({ t: '+' })
    expect(result.current.aviso).toBeNull()
  })

  it('obligatorio: sin la coletilla "o déjalo vacío"', () => {
    const { result } = renderHook(() => useAvisoIndiceAlEnviar('abc', 'c', { opcional: false, rango: 'indice' }))
    expect(result.current.aviso).toBe('Escribe un número: 12.4, o +2 si es plus.')
  })

  it('con rango de índice, "60" avisa el rango en vivo y no deja enviar; sin rango, se envía', () => {
    const conRango = renderHook(() => useAvisoIndiceAlEnviar('60', 'c', OPCIONAL_INDICE))
    expect(conRango.result.current.aviso).toMatch(/^Revisa el índice de handicap/)
    expect(conRango.result.current.sePuedeEnviar).toBe(false)
    const sinRango = renderHook(() => useAvisoIndiceAlEnviar('60', 'c', { opcional: true, rango: null }))
    expect(sinRango.result.current.aviso).toBeNull()
    expect(sinRango.result.current.sePuedeEnviar).toBe(true)
  })

  it.each(['', '+2', '18,5'])('"%s" se envía sin aviso', texto => {
    const { result } = renderHook(() => useAvisoIndiceAlEnviar(texto, 'c', OPCIONAL_INDICE))
    let paso = false
    act(() => { paso = result.current.validarAlEnviar() })
    expect(paso).toBe(true)
    expect(result.current.aviso).toBeNull()
  })
})
