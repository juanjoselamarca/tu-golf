import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVisibilityRefresh } from './useVisibilityRefresh'

// Helpers to simulate visibility state changes
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useVisibilityRefresh', () => {
  beforeEach(() => {
    // Start hidden by default so we can trigger visible
    setVisibility('hidden')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onVisible when document goes from hidden to visible', () => {
    const onVisible = vi.fn()
    renderHook(() => useVisibilityRefresh(onVisible))

    setVisibility('visible')

    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onVisible when document becomes hidden', () => {
    const onVisible = vi.fn()
    // Start as visible so we can go hidden
    setVisibility('visible')
    renderHook(() => useVisibilityRefresh(onVisible))

    setVisibility('hidden')

    expect(onVisible).not.toHaveBeenCalled()
  })

  it('does not subscribe if enabled=false', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const onVisible = vi.fn()
    renderHook(() => useVisibilityRefresh(onVisible, false))

    expect(addSpy).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    setVisibility('visible')
    expect(onVisible).not.toHaveBeenCalled()
  })

  it('cleans up listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const onVisible = vi.fn()
    const { unmount } = renderHook(() => useVisibilityRefresh(onVisible))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
