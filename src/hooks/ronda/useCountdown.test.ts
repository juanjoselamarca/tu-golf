import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from './useCountdown'

describe('useCountdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('inicializa con el valor initial', () => {
    const { result } = renderHook(() => useCountdown(15, () => {}))
    expect(result.current).toBe(15)
  })

  it('decrementa cada segundo', () => {
    const { result } = renderHook(() => useCountdown(3, () => {}))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(2)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(1)
  })

  it('al llegar a 0 llama a onExpire y reinicia a initial', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useCountdown(2, onExpire))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(1)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(2) // reset
  })

  it('no tickea cuando enabled=false', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useCountdown(3, onExpire, false))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current).toBe(3)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('arranca a tickear cuando enabled pasa a true', () => {
    const onExpire = vi.fn()
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCountdown(3, onExpire, enabled),
      { initialProps: { enabled: false } }
    )
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current).toBe(3) // sin cambios

    rerender({ enabled: true })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(2)
  })

  it('limpia el intervalo al desmontar', () => {
    const onExpire = vi.fn()
    const { unmount } = renderHook(() => useCountdown(3, onExpire))
    act(() => { vi.advanceTimersByTime(1000) })
    unmount()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('cambios en onExpire no reinician el intervalo (ref interna)', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useCountdown(2, cb),
      { initialProps: { cb: first } }
    )
    act(() => { vi.advanceTimersByTime(1000) })
    rerender({ cb: second })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
