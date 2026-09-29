/**
 * triggerRoundUpdatePush — throttle con envío final (review I3).
 *
 * 4 jugadores anotan el mismo hoyo en <15s: antes salía sólo el primero y el
 * resto de la ventana se perdía (el espectador veía al jugador 1 con un hoyo
 * de más). Ahora: el primero sale al instante y UNO más al cerrar la ventana.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key')
vi.mock('./error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { triggerRoundUpdatePush, pushThrottleRemainingMs, PUSH_THROTTLE_MS, FORCE_RETRY_DELAYS_MS } from './round-notifications'

const fetchMock = vi.fn(async () => ({ ok: true }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-25T20:00:00Z'))
  sessionStorage.clear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const bodies = () => fetchMock.mock.calls.map(c => JSON.parse((c as unknown as [string, { body: string }])[1].body).codigo)

describe('triggerRoundUpdatePush', () => {
  it('primer guardado sale al instante', () => {
    triggerRoundUpdatePush('ABC')
    expect(bodies()).toEqual(['ABC'])
  })

  it('4 guardados en 3s → 1 inmediato + 1 al cerrar la ventana de 15s (no 4, no 1)', () => {
    triggerRoundUpdatePush('ABC')
    vi.advanceTimersByTime(1000); triggerRoundUpdatePush('ABC')
    vi.advanceTimersByTime(1000); triggerRoundUpdatePush('ABC')
    vi.advanceTimersByTime(1000); triggerRoundUpdatePush('ABC')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(PUSH_THROTTLE_MS - 3000 - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Y la ventana se re-arma desde el envío final.
    triggerRoundUpdatePush('ABC')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rondas distintas no se frenan entre sí', () => {
    triggerRoundUpdatePush('ABC')
    triggerRoundUpdatePush('XYZ')
    expect(bodies()).toEqual(['ABC', 'XYZ'])
  })

  it('force (ronda finalizada) salta el throttle y cancela el envío pendiente', () => {
    triggerRoundUpdatePush('ABC')
    vi.advanceTimersByTime(500); triggerRoundUpdatePush('ABC')  // queda pendiente
    triggerRoundUpdatePush('ABC', { force: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(PUSH_THROTTLE_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(2)  // el pendiente se canceló
  })

  it('sin fetch (entorno sin red) no explota', () => {
    vi.stubGlobal('fetch', undefined)
    expect(() => triggerRoundUpdatePush('ABC', { force: true })).not.toThrow()
  })

  it('el jugadorId (invitado sin cuenta) viaja en el body, también en el envío final', () => {
    triggerRoundUpdatePush('ABC', { jugadorId: 'j-1' })
    vi.advanceTimersByTime(1000); triggerRoundUpdatePush('ABC', { jugadorId: 'j-1' })
    vi.advanceTimersByTime(PUSH_THROTTLE_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const c of fetchMock.mock.calls) {
      expect(JSON.parse((c as unknown as [string, { body: string }])[1].body)).toEqual({ codigo: 'ABC', jugadorId: 'j-1' })
    }
  })

  it('force reintenta ante no-2xx (0 / 500 / 1500 ms) y para al primer 2xx — el resultado final no se pierde (review I-B)', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    triggerRoundUpdatePush('FIN', { force: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(FORCE_RETRY_DELAYS_MS).toEqual([0, 500, 1500])
  })

  it('sin force NO reintenta (el siguiente guardado ya trae el estado nuevo)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })
    triggerRoundUpdatePush('NOF')
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('pushThrottleRemainingMs', () => {
  it('0 y marca la ventana; después informa lo que falta', () => {
    expect(pushThrottleRemainingMs('Q', 1_000_000)).toBe(0)
    expect(pushThrottleRemainingMs('Q', 1_005_000)).toBe(PUSH_THROTTLE_MS - 5_000)
    expect(pushThrottleRemainingMs('Q', 1_000_000 + PUSH_THROTTLE_MS)).toBe(0)
  })
})
