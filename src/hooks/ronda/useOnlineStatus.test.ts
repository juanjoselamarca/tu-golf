import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

describe('useOnlineStatus', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = navigator.onLine
    // Fuerza estado inicial determinístico — algunos entornos CI reportan offline
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true, writable: true })
  })

  it('inicializa con navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('cambia a false cuando dispara el evento offline', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
  })

  it('cambia a true cuando dispara el evento online', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toBe(true)
  })

  it('limpia los listeners al desmontar', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
    removeSpy.mockRestore()
  })
})
