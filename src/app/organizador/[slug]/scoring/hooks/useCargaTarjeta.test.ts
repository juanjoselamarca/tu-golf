// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchRoundHoleScores = vi.fn()
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (...a: unknown[]) => fetchRoundHoleScores(...a),
}))

import { useCargaTarjeta } from './useCargaTarjeta'
import { crearEstadoHoyos } from './estado-hoyos'

function montar(roundId: string | null | undefined = 'r1') {
  const store = crearEstadoHoyos({ enviar: () => new Promise(() => {}) })
  const showError = vi.fn()
  const h = renderHook((p: { roundId: string | null | undefined }) =>
    useCargaTarjeta({ roundId: p.roundId, store, parDe: () => 4, showError }), { initialProps: { roundId } })
  return { ...h, store, showError }
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchRoundHoleScores.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCargaTarjeta', () => {
  // #836: un `showError` nuevo en cada render (useToast inestable) hacía consultar la tarjeta en bucle.
  it('un showError distinto en cada render no vuelve a consultar la tarjeta', async () => {
    fetchRoundHoleScores.mockResolvedValue([])
    const store = crearEstadoHoyos({ enviar: () => new Promise(() => {}) })
    const { result, rerender } = renderHook(() =>
      useCargaTarjeta({ roundId: 'r1', store, parDe: () => 4, showError: vi.fn() }))
    for (let i = 0; i < 5; i++) {
      rerender()
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    }
    expect(fetchRoundHoleScores).toHaveBeenCalledTimes(1)
    expect(result.current.cargaTarjeta).toBe('lista')
  })

  it('siembra lo leído y queda lista', async () => {
    fetchRoundHoleScores.mockResolvedValue([{ hole_number: 2, gross_score: 5, putts: 2, fairway_hit: null, gir: true }])
    const { result, store } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(store.vista('r1')[2]).toMatchObject({ gross: 5, putts: 2, gir: true, estado: 'limpio' })
  })

  it('corta a los 10 s sin AbortSignal.timeout (iOS 15): error, aviso y consulta abortada', async () => {
    vi.stubGlobal('AbortSignal', Object.assign(function () {}, { timeout: undefined }))
    let signal: AbortSignal | undefined
    fetchRoundHoleScores.mockImplementation((_c: unknown, _r: string, s: AbortSignal) => {
      signal = s
      return new Promise(() => {})
    })
    const { result, showError } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
    expect(result.current.cargaLenta).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
    expect(result.current.cargaTarjeta).toBe('error')
    expect(signal?.aborted).toBe(true)
    expect(showError).toHaveBeenCalledTimes(1)
  })

  it('una recarga que falla con la tarjeta ya cargada no bloquea ni avisa', async () => {
    fetchRoundHoleScores.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('red'))
    const { result, showError } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await result.current.reintentarCarga() })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(showError).not.toHaveBeenCalled()
  })

  it('una ronda nueva vuelve a "cargando" y un jugador sin tarjeta queda "lista"', async () => {
    fetchRoundHoleScores.mockResolvedValueOnce([]).mockReturnValueOnce(new Promise(() => {}))
    const { result, rerender } = montar()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    rerender({ roundId: 'r2' })
    expect(result.current.cargaTarjeta).toBe('cargando')
    rerender({ roundId: null })
    expect(result.current.cargaTarjeta).toBe('lista')
  })
})
