import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTorneoRealtime } from './useTorneoRealtime'

// Mock Supabase client
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockImplementation((cb) => {
    cb('SUBSCRIBED')
    return mockChannel
  }),
}
const mockRemoveChannel = vi.fn()
const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: mockRemoveChannel,
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabase,
}))

describe('useTorneoRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('crea un canal con el nombre correcto', () => {
    renderHook(() => useTorneoRealtime('abc-123', vi.fn()))
    expect(mockSupabase.channel).toHaveBeenCalledWith('tournament:abc-123')
  })

  it('suscribe a evento broadcast "score_update"', () => {
    renderHook(() => useTorneoRealtime('abc-123', vi.fn()))
    expect(mockChannel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'score_update' },
      expect.any(Function),
    )
  })

  it('devuelve isConnected=true cuando status es SUBSCRIBED', () => {
    const { result } = renderHook(() => useTorneoRealtime('abc-123', vi.fn()))
    expect(result.current.isConnected).toBe(true)
  })

  it('no suscribe si tournamentId esta vacio', () => {
    renderHook(() => useTorneoRealtime('', vi.fn()))
    expect(mockSupabase.channel).not.toHaveBeenCalled()
  })

  it('no suscribe si enabled=false', () => {
    renderHook(() => useTorneoRealtime('abc-123', vi.fn(), false))
    expect(mockSupabase.channel).not.toHaveBeenCalled()
  })

  it('limpia canal al desmontar', () => {
    const { unmount } = renderHook(() => useTorneoRealtime('abc-123', vi.fn()))
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('debounce: multiples broadcasts en <500ms generan un solo onChange', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    renderHook(() => useTorneoRealtime('abc-123', onChange))

    const broadcastCb = mockChannel.on.mock.calls[0][2]

    // 3 broadcasts rapidos
    broadcastCb({ event: 'score_update', payload: {} })
    vi.advanceTimersByTime(100)
    broadcastCb({ event: 'score_update', payload: {} })
    vi.advanceTimersByTime(100)
    broadcastCb({ event: 'score_update', payload: {} })

    // Antes del debounce: 0 calls
    expect(onChange).not.toHaveBeenCalled()

    // Despues del debounce: 1 call
    vi.advanceTimersByTime(500)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('un solo broadcast despues de 500ms dispara onChange', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    renderHook(() => useTorneoRealtime('abc-123', onChange))

    const broadcastCb = mockChannel.on.mock.calls[0][2]
    broadcastCb({ event: 'score_update', payload: {} })

    vi.advanceTimersByTime(499)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledOnce()
  })
})
