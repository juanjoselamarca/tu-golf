import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ResultadoTorneoEnVivo } from '@/lib/data/tournaments/en-vivo-api'
import type { TorneoEnVivo } from '@/lib/data/tournaments/en-vivo'

const loadTorneoEnVivo = vi.fn<(slug: string) => Promise<ResultadoTorneoEnVivo>>()
vi.mock('@/lib/data/tournaments/en-vivo-api', () => ({ loadTorneoEnVivo: (s: string) => loadTorneoEnVivo(s) }))

import { useTorneoEnVivo, INTERVALO_TORNEO_S, conservarNombres } from './use-live-scores'

const jugador = (id: string, name: string, gross: number) => ({
  id, name, handicap_index: 10, scores_per_hole: [], gross_total: gross, vs_par: 0, thru: 1,
})
const torneo = (players: ReturnType<typeof jugador>[]): TorneoEnVivo => ({
  tournament: { id: 't1', slug: 'copa', name: 'Copa', format: 'stroke_play', modo: 'gross', hole_count: 18, total_rounds: 1, par_total: 72, status: 'in_progress', live: true },
  players, teams: [], categories: [], groups: [],
})
const INICIAL = torneo([jugador('p1', 'Ana Pérez', 4)])

async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useTorneoEnVivo (polling a la ruta cacheable, sin Realtime ni router.refresh)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loadTorneoEnVivo.mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('torneo en vivo: consulta cada intervalo y reemplaza el board, conservando el nombre del perfil del render inicial', async () => {
    // La ruta pública no trae el nombre del perfil: el motor cae al genérico.
    loadTorneoEnVivo.mockResolvedValue({ status: 'ok', data: torneo([jugador('p1', 'Jugador', 9)]), edadSegundos: 3 })
    const { result } = renderHook(() => useTorneoEnVivo('copa', INICIAL, true))
    await avanzar(0)
    expect(loadTorneoEnVivo).not.toHaveBeenCalled() // la página recién llegó del servidor
    await avanzar(INTERVALO_TORNEO_S * 1000)
    expect(loadTorneoEnVivo).toHaveBeenCalledTimes(1)
    expect(result.current.data.players[0]).toMatchObject({ name: 'Ana Pérez', gross_total: 9 })
  })

  it('nunca solapa: una consulta lenta (CDN/base) no dispara otra', async () => {
    let terminar: (r: ResultadoTorneoEnVivo) => void = () => {}
    loadTorneoEnVivo.mockImplementation(() => new Promise(r => { terminar = r }))
    const { result } = renderHook(() => useTorneoEnVivo('copa', INICIAL, true))
    await avanzar(INTERVALO_TORNEO_S * 1000)
    await avanzar(INTERVALO_TORNEO_S * 4000)
    act(() => { result.current.refresh() })
    expect(loadTorneoEnVivo).toHaveBeenCalledTimes(1)
    await act(async () => { terminar({ status: 'transient' }) })
    await avanzar(INTERVALO_TORNEO_S * 1000)
    expect(loadTorneoEnVivo).toHaveBeenCalledTimes(2)
  })

  it('un corte conserva el board que ya se mostraba', async () => {
    loadTorneoEnVivo.mockResolvedValue({ status: 'transient' })
    const { result } = renderHook(() => useTorneoEnVivo('copa', INICIAL, true))
    await avanzar(INTERVALO_TORNEO_S * 1000)
    expect(result.current.data).toBe(INICIAL)
  })

  it('torneo que no está en vivo: no consulta', async () => {
    renderHook(() => useTorneoEnVivo('copa', INICIAL, false))
    await avanzar(INTERVALO_TORNEO_S * 5000)
    expect(loadTorneoEnVivo).not.toHaveBeenCalled()
  })

  it('al volver a primer plano consulta enseguida', async () => {
    loadTorneoEnVivo.mockResolvedValue({ status: 'transient' })
    renderHook(() => useTorneoEnVivo('copa', INICIAL, true))
    await avanzar(5_000)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await avanzar(120_000)
    expect(loadTorneoEnVivo).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await avanzar(0)
    expect(loadTorneoEnVivo).toHaveBeenCalledTimes(1)
  })

  it('countdown baja con el reloj', async () => {
    const { result } = renderHook(() => useTorneoEnVivo('copa', INICIAL, true))
    await avanzar(0)
    await avanzar(5_000)
    expect(result.current.countdown).toBe(INTERVALO_TORNEO_S - 5)
  })

  it('conservarNombres: sólo pisa por id, un jugador nuevo queda con lo que trae la ruta', () => {
    const r = conservarNombres(torneo([jugador('p1', 'Jugador', 4), jugador('p2', 'Invitado X', 5)]), new Map([['p1', 'Ana Pérez']]))
    expect(r.players.map(p => p.name)).toEqual(['Ana Pérez', 'Invitado X'])
  })
})
