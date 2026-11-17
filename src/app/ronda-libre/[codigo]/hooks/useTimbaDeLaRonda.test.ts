import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const juego = vi.hoisted(() => ({
  opciones: [] as unknown[],
  estado: { estado: 'cargando' } as Record<string, unknown>,
  recargar: null as unknown as ReturnType<typeof vi.fn>,
}))
vi.mock('./useJuegoDeLaTimba', () => ({
  useJuegoDeLaTimba: (_codigo: string, opciones: unknown) => {
    juego.opciones.push(opciones)
    return { juego: juego.estado, vista: null, vistaPedidaEn: null, recargar: juego.recargar }
  },
}))

import {
  juegoDeLaRondaCerrada,
  REINTENTO_CERRADA_BASE_MS,
  REINTENTO_CERRADA_MAX_MS,
  useTimbaDeLaRonda,
} from './useTimbaDeLaRonda'

const ronda = (estado: string, formato = 'personalizado') => ({ formato_juego: formato, estado, ronda_libre_jugadores: [{ scores: { '1': 4 } }] })
const AHORA = Date.parse('2026-11-16T15:00:00Z')
/** La firma con la que `useTimbaDeLaRonda` pide el juego de `ronda('finalizada')` para el usuario u1. */
const CERRADA = 'u1:finalizada:[{"1":4}]'
const EN_CURSO = 'u1:en_curso:[{"1":4}]'
const ok = (firma: string, desactualizado = false) =>
  ({ estado: 'ok', desactualizado, pedidaEn: AHORA, firma, vista: { retiros: { p2: 14 } } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
  juego.recargar = vi.fn(async () => {})
  juego.estado = { estado: 'cargando' }
})
afterEach(() => { vi.useRealTimers() })

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

  it('retiros: los de una vista fresca; null mientras no se saben; {} sin juego armable', () => {
    juego.estado = { estado: 'cargando' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toBeNull()
    juego.estado = { estado: 'error' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toBeNull()
    juego.estado = { estado: 'sin_juego', motivo: 'reglas_invalidas' }
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toEqual({})
    juego.estado = ok(CERRADA)
    expect(renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1')).result.current.retiros).toEqual({ p2: 14 })
  })

  it('cerrada: una vista pedida antes del cierre (otra firma) no arma el resultado ni da retiros (cargando)', () => {
    juego.estado = ok(EN_CURSO)
    const { result } = renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1'))
    expect(result.current.juego).toEqual({ estado: 'cargando' })
    expect(result.current.retiros).toBeNull()
  })

  it('cerrada: la última vista buena tras un pedido fallido es error (Reintentar), aunque sea de después del cierre', () => {
    juego.estado = ok(CERRADA, true)
    const { result } = renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1'))
    expect(result.current.juego).toEqual({ estado: 'error' })
    expect(result.current.retiros).toBeNull()
  })

  it('en curso, la vista vieja o desactualizada se muestra igual (avisada en la tabla)', () => {
    juego.estado = ok('u1:en_curso:[]', true)
    const { result } = renderHook(() => useTimbaDeLaRonda('ABC', ronda('en_curso'), 'u1'))
    expect(result.current.juego).toMatchObject({ estado: 'ok', desactualizado: true })
  })

  it('cerrada sin vista fresca: reintenta solo, con espera creciente, hasta lograrlo', () => {
    juego.estado = { estado: 'error' }
    const { result, rerender } = renderHook(() => useTimbaDeLaRonda('ABC', ronda('finalizada'), 'u1'))
    expect(juego.recargar).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(REINTENTO_CERRADA_BASE_MS) })
    expect(juego.recargar).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(REINTENTO_CERRADA_BASE_MS) })
    expect(juego.recargar).toHaveBeenCalledTimes(1) // la segunda espera es el doble
    act(() => { vi.advanceTimersByTime(REINTENTO_CERRADA_BASE_MS) })
    expect(juego.recargar).toHaveBeenCalledTimes(2)
    // Llega la vista fresca: deja de reintentar.
    juego.estado = ok(CERRADA)
    rerender()
    expect(result.current.juego).toMatchObject({ estado: 'ok' })
    act(() => { vi.advanceTimersByTime(REINTENTO_CERRADA_MAX_MS * 2) })
    expect(juego.recargar).toHaveBeenCalledTimes(2)
  })

  it('en curso no reintenta por su cuenta (para eso está el intervalo)', () => {
    juego.estado = { estado: 'error' }
    renderHook(() => useTimbaDeLaRonda('ABC', ronda('en_curso'), 'u1'))
    act(() => { vi.advanceTimersByTime(REINTENTO_CERRADA_MAX_MS * 2) })
    expect(juego.recargar).not.toHaveBeenCalled()
  })
})

describe('juegoDeLaRondaCerrada', () => {
  it('pedida con la firma de ahora pasa; con otra carga; desactualizada es error; los demás estados pasan tal cual', () => {
    expect(juegoDeLaRondaCerrada(ok(CERRADA) as never, CERRADA)).toMatchObject({ estado: 'ok' })
    expect(juegoDeLaRondaCerrada(ok(EN_CURSO) as never, CERRADA)).toEqual({ estado: 'cargando' })
    expect(juegoDeLaRondaCerrada(ok(CERRADA, true) as never, CERRADA)).toEqual({ estado: 'error' })
    expect(juegoDeLaRondaCerrada({ estado: 'sin_sesion' }, CERRADA)).toEqual({ estado: 'sin_sesion' })
  })
})
