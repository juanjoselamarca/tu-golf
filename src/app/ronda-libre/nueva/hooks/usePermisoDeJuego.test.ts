import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// El interruptor de producto se fuerza por test: así el flujo queda probado con la Timba abierta (desde el PR C2)
// y también cerrada (si hubiera que volver a cerrarla).
const interruptor = vi.hoisted(() => ({ abierta: true }))
vi.mock('@/lib/auth/timba-libre-abierta', () => ({ get TIMBA_LIBRE_ABIERTA() { return interruptor.abierta } }))
// Skins cerrado (como hoy): el permiso lo pide solo la Timba.
vi.mock('@/lib/auth/skins-libre-abierto', () => ({ SKINS_LIBRE_ABIERTO: false }))

import { usePermisoDeJuegosDeLaRonda } from './usePermisoDeJuego'
import { useTimbaDeLaRonda } from './useTimbaDeLaRonda'

/** La composición real de la pantalla: el permiso de juegos y la Timba con su interruptor. */
const usePuedeElegirTimba = (esperas: readonly number[]) => useTimbaDeLaRonda(usePermisoDeJuegosDeLaRonda(esperas)).puedeElegir

const SIN_ESPERA = [0, 0]
const responder = (impl: () => Promise<unknown>) => {
  const f = vi.fn(impl)
  vi.stubGlobal('fetch', f)
  return f
}
const respuesta = (status: number, body: unknown) => async () => ({ ok: status < 400, status, json: async () => body })

describe('permiso de la Timba en el asistente (usePermisoDeJuegosDeLaRonda + useTimbaDeLaRonda)', () => {
  afterEach(() => { vi.unstubAllGlobals(); interruptor.abierta = true })

  it('Timba cerrada (TIMBA_LIBRE_ABIERTA = false): false también para un admin, y ni pregunta', async () => {
    interruptor.abierta = false
    const f = responder(respuesta(200, { puedeCrear: true }))
    const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
    await new Promise(r => setTimeout(r, 10))
    expect(result.current).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('abierta, admin: true cuando la ruta lo confirma (antes, false)', async () => {
    responder(respuesta(200, { puedeCrear: true }))
    const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('abierta: un corte de red se reintenta y, si vuelve la señal, queda en true', async () => {
    let n = 0
    const f = responder(async () => { n++; if (n === 1) throw new Error('sin señal'); return respuesta(200, { puedeCrear: true })() })
    const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
    await waitFor(() => expect(result.current).toBe(true))
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('abierta: un 5xx también se reintenta', async () => {
    let n = 0
    responder(async () => { n++; return n === 1 ? respuesta(503, null)() : respuesta(200, { puedeCrear: true })() })
    const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('abierta: sin señal tras los reintentos (3 intentos en total) queda cerrado', async () => {
    const f = responder(async () => { throw new Error('sin señal') })
    const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(3))
    await new Promise(r => setTimeout(r, 10))
    expect(f).toHaveBeenCalledTimes(3)
    expect(result.current).toBe(false)
  })

  it('abierta: no admin o 4xx → false sin reintentar', async () => {
    for (const impl of [respuesta(200, { puedeCrear: false }), respuesta(401, { puedeCrear: true })]) {
      const f = responder(impl)
      const { result } = renderHook(() => usePuedeElegirTimba(SIN_ESPERA))
      await new Promise(r => setTimeout(r, 10))
      expect(result.current).toBe(false)
      expect(f).toHaveBeenCalledTimes(1)
    }
  })
})
