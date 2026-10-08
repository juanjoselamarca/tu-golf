import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLivePoll } from './useLivePoll'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Avanza el reloj falso y deja correr las promesas que eso destrabe. */
async function avanzar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('useLivePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('consulta al arrancar y luego cada intervalo', async () => {
    const poll = vi.fn(async () => {})
    renderHook(() => useLivePoll(poll, { intervalMs: 10_000 }))
    await avanzar(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await avanzar(9_999)
    expect(poll).toHaveBeenCalledTimes(1)
    await avanzar(1)
    expect(poll).toHaveBeenCalledTimes(2)
    await avanzar(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('immediate=false: la primera consulta espera el intervalo', async () => {
    const poll = vi.fn(async () => {})
    renderHook(() => useLivePoll(poll, { intervalMs: 5_000, immediate: false }))
    await avanzar(4_999)
    expect(poll).not.toHaveBeenCalled()
    await avanzar(1)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('nunca solapa: una consulta lenta no dispara otra, y la siguiente se cuenta desde que termina', async () => {
    let terminar: () => void = () => {}
    const poll = vi.fn(() => new Promise<void>(r => { terminar = r }))
    const { result } = renderHook(() => useLivePoll(poll, { intervalMs: 10_000 }))
    await avanzar(0)
    expect(poll).toHaveBeenCalledTimes(1)
    // 60 s colgada: ni el intervalo ni el botón "Actualizar" lanzan una segunda.
    await avanzar(60_000)
    void result.current.pollNow()
    void result.current.pollNow()
    expect(poll).toHaveBeenCalledTimes(1)
    await act(async () => { terminar() })
    await avanzar(9_999)
    expect(poll).toHaveBeenCalledTimes(1)
    await avanzar(1)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('en segundo plano no consulta; al volver consulta enseguida y retoma', async () => {
    const poll = vi.fn(async () => {})
    const { result } = renderHook(() => useLivePoll(poll, { intervalMs: 10_000 }))
    await avanzar(0)
    expect(poll).toHaveBeenCalledTimes(1)
    act(() => setVisibility('hidden'))
    expect(result.current.nextPollAt).toBeNull()
    await avanzar(120_000)
    expect(poll).toHaveBeenCalledTimes(1)
    act(() => setVisibility('visible'))
    await avanzar(0)
    expect(poll).toHaveBeenCalledTimes(2)
    await avanzar(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('un error de poll no corta el ciclo', async () => {
    const poll = vi.fn(async () => { throw new Error('red caída') })
    renderHook(() => useLivePoll(poll, { intervalMs: 1_000 }))
    await avanzar(0)
    await avanzar(1_000)
    await avanzar(1_000)
    expect(poll).toHaveBeenCalledTimes(3)
  })

  it('enabled=false no consulta ni al volver a primer plano', async () => {
    const poll = vi.fn(async () => {})
    const { result } = renderHook(() => useLivePoll(poll, { intervalMs: 1_000, enabled: false }))
    await avanzar(10_000)
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    await avanzar(10_000)
    expect(poll).not.toHaveBeenCalled()
    expect(result.current.nextPollAt).toBeNull()
  })

  it('al desmontar no queda ningún timer ni listener', async () => {
    const poll = vi.fn(async () => {})
    const { unmount } = renderHook(() => useLivePoll(poll, { intervalMs: 1_000 }))
    await avanzar(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    setVisibility('hidden')
    setVisibility('visible')
    await avanzar(10_000)
    expect(poll).toHaveBeenCalledTimes(1)
  })

  it('expone la hora de la próxima consulta', async () => {
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    const poll = vi.fn(async () => {})
    const { result } = renderHook(() => useLivePoll(poll, { intervalMs: 10_000 }))
    await avanzar(0)
    expect(result.current.nextPollAt).toBe(Date.parse('2026-10-08T12:00:00Z') + 10_000)
  })

  it('usa siempre el poll más reciente sin reiniciar el ciclo', async () => {
    const a = vi.fn(async () => {})
    const b = vi.fn(async () => {})
    const { rerender } = renderHook(({ fn }) => useLivePoll(fn, { intervalMs: 1_000 }), { initialProps: { fn: a } })
    await avanzar(0)
    rerender({ fn: b })
    await avanzar(1_000)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
