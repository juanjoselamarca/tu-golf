import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScoreSave } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreSave'
import { addToast } from '@/hooks/useToast'

const mockUpdate = vi.fn()
const mockSingle = vi.fn()
const mockRpc = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      update: mockUpdate,
      select: () => ({ eq: () => ({ single: mockSingle }) }),
    }),
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/ronda/score-storage', () => ({
  saveScores: vi.fn(),
  loadScores: vi.fn(),
  clearScores: vi.fn(),
}))

vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))

const makeScoreSync = () => ({
  guardarLocal: vi.fn(),
  marcarSincronizado: vi.fn(),
  tienePendientes: vi.fn(() => false),
  obtenerLocal: vi.fn(),
  obtenerTimestamp: vi.fn(() => 0),
  syncInProgressRef: { current: false },
})

// Helper: avanzar timer + flush microtasks (promises del RPC)
async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(500)
    // Flush pending microtasks (RPC promise resolution)
    await vi.runAllTimersAsync()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockUpdate.mockReset()
  mockSingle.mockReset()
  mockRpc.mockReset()
  mockSingle.mockResolvedValue({ data: { estado: 'en_curso' } })
  mockUpdate.mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
  mockRpc.mockResolvedValue({ data: { '1': 4 }, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useScoreSave', () => {
  it('saveStatus arranca en idle', () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.hasUnsaved).toBe(false)
  })

  it('guarda local inmediato, offline no dispara RPC', async () => {
    const scoreSync = makeScoreSync()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: false, scoreSync,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    expect(scoreSync.guardarLocal).toHaveBeenCalledWith({ 1: 4 })
    await flushDebounce()
    expect(result.current.saveStatus).toBe('offline')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('debounce: RPC se dispara 500ms después', async () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    expect(mockRpc).not.toHaveBeenCalled()
    await flushDebounce()
    expect(mockRpc).toHaveBeenCalledOnce()
  })

  it('debounce: múltiples saves rápidos = 1 solo RPC con último valor', async () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    await act(async () => {
      await result.current.saveScores('p1', { 1: 4 })
      await result.current.saveScores('p1', { 1: 5 })
      await result.current.saveScores('p1', { 1: 6 })
    })
    expect(mockRpc).not.toHaveBeenCalled()
    await flushDebounce()
    expect(mockRpc).toHaveBeenCalledOnce()
    expect(mockRpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', {
      p_jugador_id: 'p1',
      p_codigo: 'ABC123',
      p_delta: { '1': 6 },
    })
  })

  it('onSaveSuccess llamado al éxito', async () => {
    const onSaveSuccess = vi.fn()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onSaveSuccess,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    await flushDebounce()
    expect(onSaveSuccess).toHaveBeenCalledOnce()
  })

  it('onRondaFinalized si RPC devuelve P0002', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
    const onRondaFinalized = vi.fn()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    await flushDebounce()
    expect(onRondaFinalized).toHaveBeenCalledOnce()
    expect(result.current.saveStatus).toBe('error')
  })

  it('usa rpc upsert no UPDATE directo', async () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4, 2: 3 }) })
    await flushDebounce()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', {
      p_jugador_id: 'p1',
      p_codigo: 'ABC123',
      p_delta: { '1': 4, '2': 3 },
    })
  })

  describe('guardarAhora (Finalizar)', () => {
    it('cancela el debounce pendiente y guarda una sola vez, esperando la respuesta', async () => {
      const scoreSync = makeScoreSync()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync }))
      await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
      let r: string | undefined
      await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4, 2: 5 }) })
      expect(r).toBe('guardado')
      expect(scoreSync.guardarLocal).toHaveBeenLastCalledWith({ 1: 4, 2: 5 })
      await flushDebounce()
      expect(mockRpc).toHaveBeenCalledOnce()
      expect(mockRpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', { p_jugador_id: 'p1', p_codigo: 'ABC123', p_delta: { '1': 4, '2': 5 } })
      expect(scoreSync.marcarSincronizado).toHaveBeenCalled()
    })

    it('offline: sin_conexion, sin RPC y sin toast propio (lo da Finalizar)', async () => {
      vi.mocked(addToast).mockClear()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: false, scoreSync: makeScoreSync() }))
      let r: string | undefined
      await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4 }) })
      expect(r).toBe('sin_conexion')
      expect(mockRpc).not.toHaveBeenCalled()
      expect(addToast).not.toHaveBeenCalled()
    })

    it('3 intentos fallidos: sin_conexion sin el toast "Error al guardar"', async () => {
      vi.mocked(addToast).mockClear()
      mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'net' } })
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync() }))
      let p!: Promise<string>
      await act(async () => { p = result.current.guardarAhora('p1', { 1: 4 }); await vi.runAllTimersAsync() })
      expect(await p).toBe('sin_conexion')
      expect(mockRpc).toHaveBeenCalledTimes(3)
      expect(addToast).not.toHaveBeenCalled()
    })

    it('P0002: finalizada y avisa a la página para redirigir', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
      const onRondaFinalized = vi.fn()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized }))
      let r: string | undefined
      await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4 }) })
      expect(r).toBe('finalizada')
      expect(onRondaFinalized).toHaveBeenCalledOnce()
    })
  })
})
