import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
// La lectura recibe la señal con la que se la cancela (al vencer el plazo o al desmontar).
vi.mock('@/lib/red/cliente-con-senal', () => ({ clienteConSenal: (_c: unknown, signal: AbortSignal) => ({ signal }) }))
const lectura = vi.hoisted(() => ({ impl: vi.fn() }))
vi.mock('@/lib/data/skins-ronda-nueva', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/data/skins-ronda-nueva')>()),
  contextoSkinsDeRondaNueva: (...a: unknown[]) => lectura.impl(...a),
}))

import { captureError } from '@/lib/error-tracking'
import { CONFIG_SKINS_POR_DEFECTO } from '@/golf/formats/skins'
import { FalloDelContextoSkins, mensajeSkinsSinRating } from '@/lib/data/skins-ronda-nueva'
import { esperaDelReintento, useValorDelHoyoSkins } from './useValorDelHoyoSkins'
import { resultadoDelSkins } from '@/golf/ronda-libre/skins-del-scorer'
import type { RondaLibre } from '@/types/ronda'
import {
  BASE_LENTA, SIN_PERMISO, clienteFalso, ok, type RespuestaFalsa,
} from '@/__tests__/helpers/postgrest-falso'

const senalDe = (llamada: number) => (lectura.impl.mock.calls[llamada][0] as { signal: AbortSignal }).signal
const RONDA = {
  id: 'r1', codigo: 'ABC', course_id: 'c1', holes: 18, hoyo_inicio: 1, recorridos: null, tees: 'blanco',
  formato_juego: 'skins',
  reglas_juego: { config: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross' }, jugadorIds: ['a', 'b'] },
  ronda_libre_jugadores: [
    { id: 'a', nombre: 'Ana', handicap: 10, tees: null },
    { id: 'b', nombre: 'Beto', handicap: 20, tees: null },
  ],
} as unknown as RondaLibre
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, si: i + 1 }))
const CONTEXTO = { jugadores: [{ nombre: 'Ana', courseHandicap: null }, { nombre: 'Beto', courseHandicap: null }], hoyos }
const ESPERAS = [30_000, 60_000, 120_000]
const PLAZO = 10_000
const montar = () => renderHook(() => useValorDelHoyoSkins({
  ronda: RONDA, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: PLAZO, esperasMs: ESPERAS,
}))
const sinSenal = () => new FalloDelContextoSkins('Failed to fetch', true)

describe('useValorDelHoyoSkins — lectura del contexto', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); lectura.impl.mockReset(); vi.mocked(captureError).mockClear() })

  it('lee una vez y muestra el valor', async () => {
    lectura.impl.mockResolvedValue(CONTEXTO)
    const { result } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toEqual({ valor: 1, provisional: false })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
  })

  it('fallo permanente (tee sin rating): no reintenta nunca y se reporta una vez', async () => {
    lectura.impl.mockRejectedValue(new FalloDelContextoSkins(mensajeSkinsSinRating('blanco'), false))
    const { result } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })

  it('un error que no es de red tampoco se reintenta', async () => {
    lectura.impl.mockRejectedValue(new Error('bug'))
    montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
  })

  it('fallo de señal: reintenta a los 30, 60 y 120 s y después cada 120 s; se reporta una sola vez', async () => {
    lectura.impl.mockRejectedValue(sinSenal())
    montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    const pasos: [number, number][] = [[29_999, 1], [1, 2], [59_999, 2], [1, 3], [119_999, 3], [1, 4], [119_999, 4], [1, 5]]
    for (const [ms, llamadas] of pasos) {
      await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
      expect(lectura.impl).toHaveBeenCalledTimes(llamadas)
    }
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('un TypeError suelto es un bug: no se reintenta (postgrest-js no lanza sin red, devuelve { error })', async () => {
    lectura.impl.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(CONTEXTO)
    const { result } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })

  it('un reporte por clase: un corte de señal reportado no tapa un error permanente posterior', async () => {
    lectura.impl
      .mockRejectedValueOnce(sinSenal())
      .mockRejectedValueOnce(sinSenal())
      .mockRejectedValueOnce(new FalloDelContextoSkins(mensajeSkinsSinRating('blanco'), false))
    montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(3)
    expect(captureError).toHaveBeenCalledTimes(2)
    const clases = vi.mocked(captureError).mock.calls.map(c => c[1]?.meta?.clase)
    expect(clases).toEqual(['senal', 'permanente'])
  })

  it('al volver la red (online) no espera el resto del plazo: relee al tiro y aparece la cifra', async () => {
    lectura.impl.mockRejectedValueOnce(sinSenal()).mockResolvedValueOnce(CONTEXTO)
    const { result } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(lectura.impl).toHaveBeenCalledTimes(2)
    expect(result.current?.valor).toBe(1)
    // La espera de 30 s quedó cancelada: no hay una tercera lectura.
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(2)
  })

  it('online con una lectura en vuelo no lanza otra; tras un fallo permanente tampoco relee', async () => {
    let soltar: (v: unknown) => void = () => {}
    lectura.impl.mockImplementationOnce(() => new Promise(r => { soltar = r }))
    const { result } = montar()
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    await act(async () => { soltar(CONTEXTO); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current?.valor).toBe(1)

    lectura.impl.mockReset()
    lectura.impl.mockRejectedValue(new FalloDelContextoSkins(mensajeSkinsSinRating('blanco'), false))
    const otro = renderHook(() => useValorDelHoyoSkins({
      ronda: { ...RONDA, id: 'r2' } as RondaLibre, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: PLAZO, esperasMs: ESPERAS,
    }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    otro.unmount()
  })

  it('desmontar quita el aviso de online', async () => {
    lectura.impl.mockRejectedValue(sinSenal())
    const { unmount } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
  })

  it('una lectura colgada vence al plazo: se aborta su señal y se reintenta como fallo de señal', async () => {
    lectura.impl.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(CONTEXTO)
    const { result } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO) })
    expect(senalDe(0).aborted).toBe(true)
    expect(captureError).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(2)
    expect(result.current?.valor).toBe(1)
  })

  it('desmontar aborta la lectura en curso, no reporta y no reintenta', async () => {
    lectura.impl.mockImplementation(() => new Promise(() => {}))
    const { unmount } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    expect(senalDe(0).aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    expect(captureError).not.toHaveBeenCalled()
  })

  it('desmontar durante la espera cancela el reintento', async () => {
    lectura.impl.mockRejectedValue(sinSenal())
    const { unmount } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
  })
})

// Revisión Fable PR #888, vuelta 3 (P1): la base lenta del 04-oct contesta con `code` (57014). Con el contexto REAL
// (no el simulado) leyendo de un cliente falso: el timeout se reintenta y la cifra aparece; un 42501 no se reintenta.
describe('useValorDelHoyoSkins — base lenta (57014) con el contexto real', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); lectura.impl.mockReset(); vi.mocked(captureError).mockClear() })

  const HOYOS_BASE = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
  const CANCHA = ok({ slope_rating: 113, course_rating: 72, par_total: 72 })
  const NETO = {
    ...RONDA, reglas_juego: { config: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'neto' }, jugadorIds: ['a', 'b'] },
  } as unknown as RondaLibre
  async function conCliente(tablas: Record<string, RespuestaFalsa[]>) {
    const real = await vi.importActual<typeof import('@/lib/data/skins-ronda-nueva')>('@/lib/data/skins-ronda-nueva')
    const supa = clienteFalso(tablas)
    lectura.impl.mockImplementation((_c: unknown, r: Parameters<typeof real.contextoSkinsDeRondaNueva>[1]) =>
      real.contextoSkinsDeRondaNueva(supa, r))
    const hook = renderHook(() => useValorDelHoyoSkins({
      ronda: NETO, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: PLAZO, esperasMs: ESPERAS,
    }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    return { ...hook, supa }
  }

  it('el rating con statement timeout se reintenta a los 30 s y la cifra aparece', async () => {
    const { result, supa } = await conCliente({
      course_holes: [ok(HOYOS_BASE)], courses: [BASE_LENTA, CANCHA], course_tees: [ok(null)],
    })
    expect(result.current).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(supa.lecturas.courses).toBe(2)
    expect(result.current?.valor).toBe(1)
  })

  it('los hoyos con statement timeout se reintentan a los 30 s y la cifra aparece', async () => {
    const { result, supa } = await conCliente({
      course_holes: [BASE_LENTA, ok(HOYOS_BASE)], courses: [CANCHA], course_tees: [ok(null)],
    })
    expect(result.current).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(supa.lecturas.course_holes).toBe(2)
    expect(result.current?.valor).toBe(1)
  })

  it('un 42501 no se reintenta, y el reporte lleva el código (captureError no guarda cause)', async () => {
    const { result } = await conCliente({ course_holes: [ok(HOYOS_BASE)], courses: [SIN_PERMISO], course_tees: [ok(null)] })
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(lectura.impl).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
    expect(vi.mocked(captureError).mock.calls[0][1]?.meta).toMatchObject({
      codigo: 'ABC', clase: 'permanente', codigoPostgrest: '42501', causa: expect.stringContaining('permission denied'),
    })
  })
})

describe('esperaDelReintento', () => {
  it('30, 60, 120 y tope en 120', () => {
    expect([1, 2, 3, 4, 9].map(n => esperaDelReintento(n))).toEqual([30_000, 60_000, 120_000, 120_000, 120_000])
  })
})

describe('useValorDelHoyoSkins — el mismo valor que la tabla en vivo', () => {
  afterEach(() => { lectura.impl.mockReset() })

  // Ana se retira desde el 2: el 2 lo juegan Beto y Carla, que empatan. La tabla (servidor, con retiros) lo cierra
  // como arrastre y el 3 vale 2. Sin los retiros, el scorer veía el 2 «a medio anotar» y mostraba «Vale 1» provisional.
  it('con un retirado en un hoyo anterior, el VALE del scorer es el de la tabla', async () => {
    const reglas = { config: { ...CONFIG_SKINS_POR_DEFECTO, modo: 'gross' as const, validacion: false }, jugadorIds: ['a', 'b', 'c'] }
    const ronda = {
      ...RONDA, reglas_juego: reglas,
      ronda_libre_jugadores: [...RONDA.ronda_libre_jugadores, { id: 'c', nombre: 'Carla', handicap: 15, tees: null }],
    } as unknown as RondaLibre
    const contexto = { ...CONTEXTO, jugadores: [...CONTEXTO.jugadores, { nombre: 'Carla', courseHandicap: null }] }
    lectura.impl.mockResolvedValue(contexto)
    const scores = { a: { 1: 3 }, b: { 1: 4, 2: 4 }, c: { 1: 4, 2: 4 } }
    const retiros = { a: 2 }
    const { result } = renderHook(() => useValorDelHoyoSkins({ ronda, scores, fuera: {}, retiros, currentHole: 3 }))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    const tabla = resultadoDelSkins({ reglas, contexto, scores, fuera: {}, retiros })!.hoyos.find(h => h.numero === 3)!
    expect(tabla).toMatchObject({ valor: 2, valorProvisional: false })
    expect(result.current).toEqual({ valor: tabla.valor, provisional: tabla.valorProvisional })
  })
})

describe('useValorDelHoyoSkins — golpes congelados al crear', () => {
  afterEach(() => { lectura.impl.mockReset() })

  it('con `congelado` que calza no lee la cancha: el VALE sale de lo congelado aunque la cancha haya cambiado', async () => {
    const congelado = {
      version: 1,
      huella: {
        courseId: 'c1', holes: 18, hoyoInicio: 1, recorridos: null,
        jugadores: { a: { indice: 10, tee: 'blanco' }, b: { indice: 20, tee: 'blanco' } },
      },
      hoyos, golpes: { a: null, b: null },
    }
    const ronda = { ...RONDA, reglas_juego: { ...(RONDA.reglas_juego as object), congelado } } as unknown as RondaLibre
    const { result } = renderHook(() => useValorDelHoyoSkins({
      ronda, scores: {}, fuera: {}, retiros: undefined, currentHole: 1, plazoMs: PLAZO, esperasMs: ESPERAS,
    }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(lectura.impl).not.toHaveBeenCalled()
    expect(result.current).toEqual({ valor: 1, provisional: false })
  })
})
