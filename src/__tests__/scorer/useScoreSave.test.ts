import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useScoreSave } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreSave'

// Mock supabase. `update` se conserva para que tests legacy que lo asertan
// sigan funcionando — pero el path productivo ahora va por `rpc()` (audit P0 #1).
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

// Mock localStorage wrappers
vi.mock('@/lib/ronda/score-storage', () => ({
  saveScores: vi.fn(),
  loadScores: vi.fn(),
  clearScores: vi.fn(),
}))

// Mock toast
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))

// Stub scoreSync
const makeScoreSync = () => ({
  guardarLocal: vi.fn(),
  marcarSincronizado: vi.fn(),
  tienePendientes: vi.fn(() => false),
  obtenerLocal: vi.fn(),
  obtenerTimestamp: vi.fn(() => 0),
  syncInProgressRef: { current: false },
})

beforeEach(() => {
  mockUpdate.mockReset()
  mockSingle.mockReset()
  mockRpc.mockReset()
  mockSingle.mockResolvedValue({ data: { estado: 'en_curso' } })
  mockUpdate.mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
  // El happy path del save productivo ahora invoca rpc('upsert_ronda_libre_scores').
  mockRpc.mockResolvedValue({ data: { '1': 4 }, error: null })
})

describe('useScoreSave', () => {
  it('saveStatus arranca en idle', () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.hasUnsaved).toBe(false)
  })

  it('guarda local SIEMPRE antes de tocar supabase', async () => {
    const scoreSync = makeScoreSync()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: false, scoreSync,  // offline
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    expect(scoreSync.guardarLocal).toHaveBeenCalledWith({ 1: 4 })
    expect(result.current.saveStatus).toBe('offline')  // sin supabase
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('transicion de status: saving => saved => idle (online)', async () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    // saveStatus eventually transitions to 'idle' via setTimeout — out of scope for this unit test
  })

  it('onSaveSuccess llamado al exito (UI feedback)', async () => {
    const onSaveSuccess = vi.fn()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onSaveSuccess,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledOnce())
  })

  it('onRondaFinalized llamado si supabase reporta ronda finalizada (pre-check)', async () => {
    mockSingle.mockResolvedValue({ data: { estado: 'finalizada' } })
    const onRondaFinalized = vi.fn()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    expect(onRondaFinalized).toHaveBeenCalledOnce()
    expect(result.current.saveStatus).toBe('error')
    expect(mockRpc).not.toHaveBeenCalled()  // pre-check corta antes del RPC
  })

  it('onRondaFinalized llamado si el RPC devuelve P0002 (race finalizada)', async () => {
    // Audit P0 #1: la RPC también valida estado atómicamente — si entre el
    // pre-check y el RPC otra sesión cierra la ronda, el RPC throws P0002.
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'RONDA_FINALIZED' } })
    const onRondaFinalized = vi.fn()
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), onRondaFinalized,
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    expect(onRondaFinalized).toHaveBeenCalledOnce()
    expect(result.current.saveStatus).toBe('error')
  })

  it('llama rpc upsert_ronda_libre_scores con el delta y codigo (no UPDATE directo)', async () => {
    const { result } = renderHook(() => useScoreSave({
      codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(),
    }))
    await act(async () => { await result.current.saveScores('p1', { 1: 4, 2: 3 }) })
    expect(mockUpdate).not.toHaveBeenCalled()  // bug-prevention: nunca el UPDATE viejo
    expect(mockRpc).toHaveBeenCalledWith('upsert_ronda_libre_scores', {
      p_jugador_id: 'p1',
      p_codigo: 'ABC123',
      p_delta: { '1': 4, '2': 3 },
    })
  })
})
