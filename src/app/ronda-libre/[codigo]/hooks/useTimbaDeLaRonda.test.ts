import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const juego = vi.hoisted(() => ({ opciones: [] as unknown[], estado: { estado: 'cargando' } as Record<string, unknown> }))
vi.mock('./useJuegoDeLaTimba', () => ({
  useJuegoDeLaTimba: (_codigo: string, opciones: unknown) => {
    juego.opciones.push(opciones)
    return { juego: juego.estado, vista: null, vistaPedidaEn: null, recargar: vi.fn() }
  },
}))

import { useTimbaDeLaRonda } from './useTimbaDeLaRonda'

const ronda = (estado: string, formato = 'personalizado') => ({ formato_juego: formato, estado, ronda_libre_jugadores: [{ scores: { '1': 4 } }] })

describe('useTimbaDeLaRonda', () => {
  it('en curso pide el juego cada 20 s (intervalo por defecto); finalizada no lo vuelve a pedir', () => {
    renderHook(() => useTimbaDeLaRonda('ABC', ronda('en_curso'), 'u1'))
    expect(juego.opciones.at(-1)).toMatchObject({ activo: true, intervaloS: undefined })
    renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1'))
    expect(juego.opciones.at(-1)).toMatchObject({ activo: true, intervaloS: 0 })
  })

  it('fuera de una Timba no pide nada y no hay retiros que aplicar', () => {
    const { result } = renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada', 'stroke_play'), 'u1'))
    expect(juego.opciones.at(-1)).toMatchObject({ activo: false })
    expect(result.current.retiros).toEqual({})
    expect(result.current.esTimba).toBe(false)
  })

  it('retiros: los de la vista; null mientras no se saben; {} sin juego armable', () => {
    juego.estado = { estado: 'cargando' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toBeNull()
    juego.estado = { estado: 'error' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toBeNull()
    juego.estado = { estado: 'sin_juego', motivo: 'reglas_invalidas' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toEqual({})
    juego.estado = { estado: 'ok', desactualizado: false, pedidaEn: 1, vista: { retiros: { p2: 14 } } }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toEqual({ p2: 14 })
  })
})
