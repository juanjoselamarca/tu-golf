import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

const loadRondaLibre = vi.fn<(codigo: string) => Promise<LoadRondaResult>>()
const loadHcpConSesion = vi.fn()
vi.mock('@/lib/data/ronda-libre-live-api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/data/ronda-libre-live-api')>()
  return { ...real, loadRondaLibre: (c: string) => loadRondaLibre(c), loadHcpConSesion: (c: string) => loadHcpConSesion(c) }
})
const notifyScoreEvent = vi.fn()
vi.mock('@/lib/push-notifications', () => ({
  notifyScoreEvent: (...a: unknown[]) => notifyScoreEvent(...a),
  getNotifPrefs: () => ({ spectator: true }),
}))

import { useRondaLibreLive, INTERVALO_EN_VIVO_S } from './useRondaLibreLive'

const ok = (scoresAna: Record<string, number>, estado = 'en_curso', edadSegundos = 0): LoadRondaResult => ({
  status: 'ok',
  ronda: {
    id: 'r1', codigo: 'ABC', course_name: 'Los Leones', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
    fecha: '2026-10-08', estado, modo_juego: 'gross', formato_juego: 'stroke_play',
    ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana', user_id: null, scores: scoresAna, handicap: 10, tees: null }],
  } as never,
  parMap: { 1: 4, 2: 4 }, siMap: { 1: 1, 2: 2 }, courseHcpMap: { j1: 10 }, displayHcpMap: { j1: 10 },
  sinIndice: [], equipos: [], edadSegundos,
})

async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useRondaLibreLive (polling, sin Realtime)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loadRondaLibre.mockReset()
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'sin-sesion' })
    notifyScoreEvent.mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('el GWI se recalcula SÓLO cuando cambian los golpes (no en cada consulta)', async () => {
    const onRefresh = vi.fn()
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    const { result } = renderHook(() => useRondaLibreLive('ABC', onRefresh))
    await avanzar(0)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4 })
    // Dos consultas más sin cambios: ni GWI ni notificaciones.
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(loadRondaLibre).toHaveBeenCalledTimes(3)
    expect(onRefresh).not.toHaveBeenCalled()
    // Llega un birdie: el espectador lo ve sin recargar, se recalcula el GWI y se notifica.
    loadRondaLibre.mockResolvedValue(ok({ 1: 4, 2: 3 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4, 2: 3 })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(notifyScoreEvent).toHaveBeenCalledWith('Ana', 'birdie', 'Birdie en hoyo 2', '/ronda-libre/ABC')
  })

  it('la primera carga no notifica lo que ya pasó', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 2, 2: 3 }))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(notifyScoreEvent).not.toHaveBeenCalled()
  })

  it('corte de red en la primera carga → pantalla de reintento (no "no encontrada"), y se recupera solo', async () => {
    loadRondaLibre.mockResolvedValue({ status: 'transient' })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.fetchError).toBe(true)
    expect(result.current.notFound).toBe(false)
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.fetchError).toBe(false)
    expect(result.current.ronda).not.toBeNull()
  })

  it('un corte con datos ya en pantalla los conserva', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    loadRondaLibre.mockResolvedValue({ status: 'transient' })
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.fetchError).toBe(false)
    expect(result.current.ronda?.ronda_libre_jugadores[0].scores).toEqual({ 1: 4 })
  })

  it('ronda finalizada o inexistente: deja de consultar', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }, 'finalizada'))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    await avanzar(60_000)
    expect(loadRondaLibre).toHaveBeenCalledTimes(1)

    loadRondaLibre.mockReset()
    loadRondaLibre.mockResolvedValue({ status: 'not_found' })
    const { result } = renderHook(() => useRondaLibreLive('NOPE'))
    await avanzar(0)
    await avanzar(60_000)
    expect(result.current.notFound).toBe(true)
    expect(loadRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('privacidad: el CH de un jugador con cuenta sin índice en la tarjeta se pide a la ruta privada UNA vez; sin sesión queda sinIndice', async () => {
    const conCuenta = () => {
      const r = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
      return { ...r, ronda: { ...r.ronda, ronda_libre_jugadores: [{ ...r.ronda.ronda_libre_jugadores[0], user_id: 'u1', handicap: null }] } as never, courseHcpMap: { j1: 0 }, displayHcpMap: { j1: 0 }, sinIndice: ['j1'] }
    }
    // Sin sesión: la privada responde null (401) → queda lo público.
    loadRondaLibre.mockResolvedValue(conCuenta())
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(anon.result.current.sinIndice).toEqual(['j1'])
    expect(anon.result.current.courseHcpMap.j1).toBe(0)
    anon.unmount()
    // Con sesión: manda la privada; se pide una sola vez aunque haya más polls.
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 11 }, sinIndice: [] } })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(loadHcpConSesion).toHaveBeenCalledTimes(1)
    expect(result.current.courseHcpMap.j1).toBe(11)
    expect(result.current.sinIndice).toEqual([])
  })

  it('ronda NETO pública (soloGross): anónimo ve sólo gross con aviso; con sesión ve el neto (handicaps de vuelta)', async () => {
    const r0 = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
    const neto = { ...r0, ronda: { ...r0.ronda, modo_juego: 'neto', ronda_libre_jugadores: [{ ...r0.ronda.ronda_libre_jugadores[0], handicap: null }] } as never, courseHcpMap: {}, displayHcpMap: {}, sinIndice: [], soloGross: true }
    loadRondaLibre.mockResolvedValue(neto)
    // Anónimo: la privada responde 401.
    const anon = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(anon.result.current.netoOculto).toBe('sin-sesion')
    expect(anon.result.current.loading).toBe(false)
    expect(anon.result.current.courseHcpMap).toEqual({})
    anon.unmount()
    // Con sesión: neto completo.
    loadHcpConSesion.mockReset()
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 12 }, sinIndice: [], handicapPorJugador: { j1: 10 }, handicapPorEquipo: {} } })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.netoOculto).toBeNull()
    expect(result.current.ronda?.modo_juego).toBe('neto')
    expect(result.current.ronda?.ronda_libre_jugadores[0].handicap).toBe(10)
    expect(result.current.courseHcpMap.j1).toBe(11)
  })

  it('ronda NETO y la privada falla: gross con aviso de error, y se reintenta en el próximo poll', async () => {
    const r0 = ok({ 1: 4 }) as Extract<LoadRondaResult, { status: 'ok' }>
    loadRondaLibre.mockResolvedValue({ ...r0, ronda: { ...r0.ronda, modo_juego: 'neto' } as never, soloGross: true })
    loadHcpConSesion.mockResolvedValue({ status: 'error' })
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.netoOculto).toBe('error')
    loadHcpConSesion.mockResolvedValue({ status: 'ok', data: { courseHcpMap: { j1: 11 }, displayHcpMap: { j1: 11 }, sinIndice: [] } })
    await avanzar(INTERVALO_EN_VIVO_S * 1000)
    expect(result.current.netoOculto).toBeNull()
  })

  it('jugadores con índice en la tarjeta: ni se pide la ruta privada', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }))
    renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(loadHcpConSesion).not.toHaveBeenCalled()
  })

  it('"actualizado hace" cuenta lo que el dato estuvo en el CDN (header Age)', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }, 'en_curso', 8))
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.timeSinceUpdate).toBe('Actualizado hace 8s')
  })
})
