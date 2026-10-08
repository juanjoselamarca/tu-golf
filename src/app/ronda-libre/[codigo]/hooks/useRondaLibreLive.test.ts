import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

const loadRondaLibre = vi.fn<(codigo: string) => Promise<LoadRondaResult>>()
vi.mock('@/lib/data/ronda-libre-live-api', () => ({ loadRondaLibre: (c: string) => loadRondaLibre(c) }))
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

  it('"actualizado hace" cuenta lo que el dato estuvo en el CDN (header Age)', async () => {
    loadRondaLibre.mockResolvedValue(ok({ 1: 4 }, 'en_curso', 8))
    const { result } = renderHook(() => useRondaLibreLive('ABC'))
    await avanzar(0)
    expect(result.current.timeSinceUpdate).toBe('Actualizado hace 8s')
  })
})
