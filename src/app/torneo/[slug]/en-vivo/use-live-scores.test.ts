import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { useLiveRefresh, INTERVALO_TORNEO_S } from './use-live-scores'

async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useLiveRefresh (torneo en vivo, sin Realtime)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refresh.mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('torneo en vivo: refresca SIEMPRE cada intervalo (ya no depende de un canal conectado)', async () => {
    renderHook(() => useLiveRefresh(true))
    await avanzar(0)
    expect(refresh).not.toHaveBeenCalled() // la página recién llegó del servidor
    await avanzar(INTERVALO_TORNEO_S * 1000)
    expect(refresh).toHaveBeenCalledTimes(1)
    await avanzar(INTERVALO_TORNEO_S * 1000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('torneo que no está en vivo: no refresca', async () => {
    renderHook(() => useLiveRefresh(false))
    await avanzar(INTERVALO_TORNEO_S * 3000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('al volver a primer plano refresca enseguida', async () => {
    renderHook(() => useLiveRefresh(true))
    await avanzar(5_000)
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await avanzar(120_000)
    expect(refresh).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await avanzar(0)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('countdown baja con el reloj', async () => {
    const { result } = renderHook(() => useLiveRefresh(true))
    await avanzar(0)
    await avanzar(10_000)
    expect(result.current.countdown).toBe(INTERVALO_TORNEO_S - 10)
  })
})
