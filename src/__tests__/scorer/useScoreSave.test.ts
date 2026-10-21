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
      expect(scoreSync.marcarSincronizado).toHaveBeenCalledWith({ 1: 4, 2: 5 })
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

    it('P0002: finalizada, sin aviso ni redirect (Finalizar sigue y guarda el historial)', async () => {
      vi.mocked(addToast).mockClear()
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
      const onRondaFinalized = vi.fn()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized }))
      let r: string | undefined
      await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4 }) })
      expect(r).toBe('finalizada')
      expect(onRondaFinalized).not.toHaveBeenCalled()
      expect(addToast).not.toHaveBeenCalled()
    })

    it('el guardado anterior que se espera recibe P0002: tampoco avisa ni redirige en medio de Finalizar', async () => {
      vi.mocked(addToast).mockClear()
      let soltarViejo!: () => void
      mockRpc
        .mockImplementationOnce(() => new Promise(res => { soltarViejo = () => res({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } }) }))
        .mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
      const onRondaFinalized = vi.fn()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized }))
      await act(async () => { await result.current.saveScores('p1', { 18: 5 }) })
      await act(async () => { vi.advanceTimersByTime(500) })
      let p!: Promise<string>
      await act(async () => { p = result.current.guardarAhora('p1', { 18: 4 }); await Promise.resolve() })
      await act(async () => { soltarViejo(); await p })
      expect(await p).toBe('finalizada')
      expect(onRondaFinalized).not.toHaveBeenCalled()
      expect(addToast).not.toHaveBeenCalled()
    })

    it('con Finalizar en curso un guardado que encuentra la ronda cerrada no avisa ni redirige, tampoco después de guardarAhora', async () => {
      vi.mocked(addToast).mockClear()
      mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
      const onRondaFinalized = vi.fn()
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized }))
      act(() => { result.current.marcarFinalizando(true) })
      await act(async () => { await result.current.saveImmediately('p1', { 18: 5 }) })
      await act(async () => { await result.current.guardarAhora('p1', { 18: 4 }) })
      await act(async () => { await result.current.saveImmediately('p1', { 18: 4 }) })
      expect(onRondaFinalized).not.toHaveBeenCalled()
      expect(addToast).not.toHaveBeenCalled()
      act(() => { result.current.marcarFinalizando(false) })
      await act(async () => { await result.current.saveImmediately('p1', { 18: 4 }) })
      expect(onRondaFinalized).toHaveBeenCalledOnce()
    })

    it('espera el guardado que ya salió: el de Finalizar llega último (el reintento viejo no pisa el golpe corregido)', async () => {
      const orden: string[] = []
      let soltarViejo!: () => void
      mockRpc
        .mockImplementationOnce((_fn: string, args: { p_delta: Record<string, number> }) => new Promise(res => {
          soltarViejo = () => { orden.push('viejo:' + args.p_delta['18']); res({ data: {}, error: null }) }
        }))
        .mockImplementation((_fn: string, args: { p_delta: Record<string, number> }) => { orden.push('final:' + args.p_delta['18']); return Promise.resolve({ data: {}, error: null }) })
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync() }))
      await act(async () => { await result.current.saveScores('p1', { 18: 5 }) })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(mockRpc).toHaveBeenCalledTimes(1)
      let p!: Promise<string>
      await act(async () => { p = result.current.guardarAhora('p1', { 18: 4 }); await Promise.resolve() })
      expect(mockRpc).toHaveBeenCalledTimes(1)
      await act(async () => { soltarViejo(); await p })
      expect(orden).toEqual(['viejo:5', 'final:4'])
    })

    it('espera todos los guardados en vuelo, no solo el último que salió', async () => {
      const orden: string[] = []
      let soltarViejo!: () => void
      mockRpc
        .mockImplementationOnce((_fn: string, args: { p_delta: Record<string, number> }) => new Promise(res => {
          soltarViejo = () => { orden.push('viejo:' + args.p_delta['17']); res({ data: {}, error: null }) }
        }))
        .mockImplementation((_fn: string, args: { p_delta: Record<string, number> }) => { orden.push(`${args.p_delta['17']}/${args.p_delta['18']}`); return Promise.resolve({ data: {}, error: null }) })
      const { result } = renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync() }))
      await act(async () => { void result.current.saveImmediately('p1', { 17: 6 }) })
      await act(async () => { await result.current.saveScores('p1', { 17: 5, 18: 5 }) })
      await act(async () => { vi.advanceTimersByTime(500) })
      expect(orden).toEqual(['5/5'])
      let p!: Promise<string>
      await act(async () => { p = result.current.guardarAhora('p1', { 17: 5, 18: 4 }); await Promise.resolve() })
      expect(mockRpc).toHaveBeenCalledTimes(2)
      await act(async () => { soltarViejo(); await p })
      expect(orden).toEqual(['5/5', 'viejo:6', '5/4'])
    })
  })
})
