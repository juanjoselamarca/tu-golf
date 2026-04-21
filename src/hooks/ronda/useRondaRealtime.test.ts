import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock del cliente Supabase ANTES de importar el hook.
type SubscribeCallback = (status: string) => void
type OnChangeCallback = () => void

const subscribeCalls: SubscribeCallback[] = []
const onChangeHandlers: OnChangeCallback[] = []
const removeChannelSpy = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn((_event: string, _filter: object, handler: OnChangeCallback) => {
        onChangeHandlers.push(handler)
        return {
          subscribe: vi.fn((cb: SubscribeCallback) => {
            subscribeCalls.push(cb)
            return {}
          }),
        }
      }),
    })),
    removeChannel: removeChannelSpy,
  })),
}))

// Import DESPUÉS del mock
import { useRondaRealtime } from './useRondaRealtime'

describe('useRondaRealtime', () => {
  beforeEach(() => {
    subscribeCalls.length = 0
    onChangeHandlers.length = 0
    removeChannelSpy.mockClear()
  })

  it('suscribe al canal cuando enabled=true y codigo está presente', () => {
    const onChange = vi.fn()
    renderHook(() => useRondaRealtime('ABC', onChange, true))
    expect(subscribeCalls).toHaveLength(1)
  })

  it('no suscribe cuando enabled=false', () => {
    const onChange = vi.fn()
    renderHook(() => useRondaRealtime('ABC', onChange, false))
    expect(subscribeCalls).toHaveLength(0)
  })

  it('no suscribe con codigo vacío', () => {
    const onChange = vi.fn()
    renderHook(() => useRondaRealtime('', onChange, true))
    expect(subscribeCalls).toHaveLength(0)
  })

  it('isConnected refleja el status SUBSCRIBED', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useRondaRealtime('ABC', onChange, true))
    expect(result.current.isConnected).toBe(false)
    act(() => { subscribeCalls[0]('SUBSCRIBED') })
    expect(result.current.isConnected).toBe(true)
    act(() => { subscribeCalls[0]('CHANNEL_ERROR') })
    expect(result.current.isConnected).toBe(false)
  })

  it('invoca onChange cuando el handler del canal dispara', () => {
    const onChange = vi.fn()
    renderHook(() => useRondaRealtime('ABC', onChange, true))
    act(() => { onChangeHandlers[0]() })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('cambios de identidad del callback no reinician la suscripción', () => {
    let cb = vi.fn()
    const { rerender } = renderHook(({ c }: { c: () => void }) => useRondaRealtime('ABC', c, true), {
      initialProps: { c: cb },
    })
    expect(subscribeCalls).toHaveLength(1)
    const newCb = vi.fn()
    rerender({ c: newCb })
    expect(subscribeCalls).toHaveLength(1) // NO reinicia
    act(() => { onChangeHandlers[0]() })
    expect(cb).not.toHaveBeenCalled()
    expect(newCb).toHaveBeenCalledTimes(1)
  })

  it('removeChannel al desmontar', () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useRondaRealtime('ABC', onChange, true))
    unmount()
    expect(removeChannelSpy).toHaveBeenCalledTimes(1)
  })
})
