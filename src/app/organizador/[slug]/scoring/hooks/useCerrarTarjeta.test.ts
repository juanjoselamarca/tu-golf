// Cerrar la tarjeta (protocolo (c) del diseño de estado por hoyo): no se cierra con golpes sin guardar, el cierre
// va a la ronda del toque y un doble toque manda un solo `finalize_round`. Reemplaza a
// useScoreEntry.finalize.test.ts (sus casos de 503 / sin señal / 409 / 403 / 502 / éxito siguen acá).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { crearEstadoHoyos, PLAZO_CIERRE_MS, type RespuestaSobre } from './estado-hoyos'
import { INTENTOS_CIERRE, useCerrarTarjeta } from './useCerrarTarjeta'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const OK_HOYO: RespuestaSobre = { lectura: 'ok', totales: { totalGross: 80, totalNet: 70, totalPoints: 36 } }
const TARJETA = { roundId: 'ra', playerId: 'pa', nombre: 'Ana' }
const PAR = { par: 4 }

type Plan = number | 'sin-senal' | { status: number; cuerpo: string }
let planes: Plan[] = []
let posts: Record<string, unknown>[] = []
const showError = vi.fn()
const showWarning = vi.fn()
const reloadRoster = vi.fn(async () => {})
const clearSelection = vi.fn()

function montar() {
  const envios: Array<(r: RespuestaSobre) => void> = []
  const store = crearEstadoHoyos({ enviar: () => new Promise((res) => { envios.push(res) }) })
  const selectedIdRef = { current: 'pa' as string | null }
  const hook = renderHook(() => useCerrarTarjeta({
    tournamentId: 't1', store, reloadRoster, clearSelection, selectedIdRef, showError, showWarning,
    esperar: async () => {},
  }))
  const responderHoyo = async (i: number, r: RespuestaSobre) => {
    envios[i](r)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  }
  return { store, hook, envios, responderHoyo, selectedIdRef }
}

const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  planes = []
  posts = []
  for (const f of [showError, showWarning, reloadRoster, clearSelection]) f.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    posts.push(JSON.parse(String(init.body)))
    const p = planes.length > 1 ? planes.shift()! : (planes[0] ?? 200)
    if (p === 'sin-senal') throw new TypeError('Failed to fetch')
    if (typeof p === 'number') return new Response('{}', { status: p })
    return new Response(p.cuerpo, { status: p.status })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCerrarTarjeta · no cierra con golpes sin guardar', () => {
  it('con el hoyo 18 en vuelo: sella, muestra los hoyos y cierra recién cuando el servidor lo confirma', async () => {
    const { store, hook, responderHoyo } = montar()
    store.editar('ra', 18, { gross: 5 }, PAR)
    let fin!: Promise<void>
    act(() => { fin = hook.result.current.cerrar(TARJETA) })
    expect(hook.result.current.estado).toMatchObject({ fase: 'guardando', hoyos: [18] })
    expect(store.editar('ra', 17, { gross: 4 }, PAR)).toBe(false)
    expect(posts).toHaveLength(0)
    await responderHoyo(0, OK_HOYO)
    await act(async () => { await fin })
    expect(posts).toEqual([{ action: 'finalize_round', tournament_id: 't1', round_id: 'ra' }])
    expect(reloadRoster).toHaveBeenCalledTimes(1)
    expect(clearSelection).toHaveBeenCalledTimes(1)
    expect(hook.result.current.estado).toBeNull()
  })

  it('si al vencer el plazo sigue sin guardar: no cierra, desella y dice qué hoyos', async () => {
    const { store, hook } = montar()
    store.editar('ra', 17, { gross: 5 }, PAR)
    store.editar('ra', 18, { gross: 4 }, PAR)
    let fin!: Promise<void>
    act(() => { fin = hook.result.current.cerrar(TARJETA) })
    await avanzar(PLAZO_CIERRE_MS)
    await act(async () => { await fin })
    expect(posts).toHaveLength(0)
    expect(showError).toHaveBeenCalledWith('No se cerró la tarjeta de Ana', 'Hoyos 17, 18 sin guardar.')
    expect(store.sellada('ra')).toBe(false)
  })

  it('con un hoyo rechazado no espera el plazo: avisa al tiro y no cierra', async () => {
    const { store, hook, responderHoyo } = montar()
    store.editar('ra', 9, { gross: 5 }, PAR)
    await responderHoyo(0, { lectura: { rechazo: 'sin_permiso' } })
    await act(async () => { await hook.result.current.cerrar(TARJETA) })
    expect(posts).toHaveLength(0)
    expect(showError).toHaveBeenCalledWith('No se cerró la tarjeta de Ana', 'Hoyo 9 sin guardar.')
  })
})

describe('useCerrarTarjeta · finalize_round', () => {
  it('16. doble toque en Finalizar → un solo POST', async () => {
    const { hook } = montar()
    await act(async () => {
      const a = hook.result.current.cerrar(TARJETA)
      const b = hook.result.current.cerrar(TARJETA)
      await Promise.all([a, b])
    })
    expect(posts).toHaveLength(1)
  })

  it('15. con otro jugador abierto al responder: cierra la ronda del toque y no le cierra la vista al nuevo', async () => {
    const { hook, selectedIdRef } = montar()
    let soltar!: () => void
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      posts.push(JSON.parse(String(init.body)))
      await new Promise<void>((r) => { soltar = r })
      return new Response('{}', { status: 200 })
    }))
    let fin!: Promise<void>
    act(() => { fin = hook.result.current.cerrar(TARJETA) })
    await avanzar(0)
    selectedIdRef.current = 'pb'
    soltar()
    await act(async () => { await fin })
    expect(posts[0]).toMatchObject({ round_id: 'ra' })
    expect(reloadRoster).toHaveBeenCalledTimes(1)
    expect(clearSelection).not.toHaveBeenCalled()
  })

  it('sin respuesta (503, sin señal, 502 con HTML) reintenta hasta 3 veces y avisa; la tarjeta sigue abierta', async () => {
    planes = [503, 'sin-senal', { status: 502, cuerpo: '<html>Bad Gateway</html>' }]
    const { store, hook } = montar()
    await act(async () => { await hook.result.current.cerrar(TARJETA) })
    expect(posts).toHaveLength(INTENTOS_CIERRE)
    expect(showError).toHaveBeenCalledWith('No se cerró la tarjeta de Ana', 'Sin respuesta del servidor. Intenta de nuevo.')
    expect(clearSelection).not.toHaveBeenCalled()
    expect(store.sellada('ra')).toBe(false)
  })

  it('un corte y después round_closed (el primero sí se aplicó): éxito, sin error', async () => {
    planes = [503, { status: 409, cuerpo: JSON.stringify({ error: 'La ronda ya está finalizada', code: 'round_closed' }) }]
    const { hook } = montar()
    await act(async () => { await hook.result.current.cerrar(TARJETA) })
    expect(posts).toHaveLength(2)
    expect(showWarning).toHaveBeenCalledWith('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
    expect(showError).not.toHaveBeenCalled()
    expect(clearSelection).toHaveBeenCalledTimes(1)
  })

  it('rechazo definitivo (403 torneo cerrado): muestra el motivo del servidor y no reintenta', async () => {
    const motivo = 'El torneo ya fue cerrado. No se pueden modificar scores.'
    planes = [{ status: 403, cuerpo: JSON.stringify({ error: motivo }) }]
    const { store, hook } = montar()
    await act(async () => { await hook.result.current.cerrar(TARJETA) })
    expect(posts).toHaveLength(1)
    expect(showError).toHaveBeenCalledWith('No se cerró la tarjeta de Ana', motivo)
    expect(reloadRoster).not.toHaveBeenCalled()
    expect(store.sellada('ra')).toBe(false)
  })
})
