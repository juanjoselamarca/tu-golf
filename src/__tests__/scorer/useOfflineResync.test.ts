import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScoreSync } from '@/hooks/useScoreSync'
import { useScoreSave } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreSave'
import { useOfflineResync } from '@/app/ronda-libre/[codigo]/score/hooks/useOfflineResync'

const mockRpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ rpc: mockRpc }) }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))

/** El scorer como lo arma page.tsx: respaldo local, guardado y reenvío del respaldo. */
function useScorer({ isOnline, finalizando = false, jugadorId = 'p1' }: { isOnline: boolean; finalizando?: boolean; jugadorId?: string }) {
  const scoreSync = useScoreSync('ABC123', jugadorId)
  const save = useScoreSave({ codigo: 'ABC123', isOnline, scoreSync })
  useOfflineResync({ isOnline, activeJugadorId: jugadorId, finalizando, scoreSync, saveImmediately: save.saveImmediately })
  return save
}

const deltas = () => mockRpc.mock.calls.map(([, args]) => args.p_delta as Record<string, number>)
const respaldoPendiente = (jugadorId: string, scores: Record<number, number>) =>
  localStorage.setItem(`golfers_score_ABC123_${jugadorId}`, JSON.stringify({ scores, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC123', jugadorId }))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('reenvío del respaldo local (useOfflineResync)', () => {
  it('un golpe sale una sola vez: el reenvío no se dispara en cada render', async () => {
    const { result, rerender } = renderHook(useScorer, { initialProps: { isOnline: true } })
    await act(async () => { await result.current.saveScores('p1', { 1: 4 }) })
    rerender({ isOnline: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(deltas()).toEqual([{ '1': 4 }])
  })

  it('al abrir con algo pendiente en el respaldo lo manda', async () => {
    respaldoPendiente('p1', { 7: 5 })
    renderHook(useScorer, { initialProps: { isOnline: true } })
    expect(deltas()).toEqual([{ '7': 5 }])
  })

  it('al volver la señal manda el respaldo, y Finalizar lo espera antes de mandar la tarjeta', async () => {
    const { result, rerender } = renderHook(useScorer, { initialProps: { isOnline: false } })
    await act(async () => { await result.current.saveScores('p1', { 17: 5 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(mockRpc).not.toHaveBeenCalled()

    let soltarReenvio!: () => void
    mockRpc.mockImplementationOnce(() => new Promise(res => { soltarReenvio = () => res({ data: {}, error: null }) }))
    rerender({ isOnline: true })
    expect(deltas()).toEqual([{ '17': 5 }])

    let p!: Promise<string>
    await act(async () => { p = result.current.guardarAhora('p1', { 17: 5, 18: 4 }); await Promise.resolve() })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    await act(async () => { soltarReenvio(); await p })
    expect(await p).toBe('guardado')
    expect(deltas()).toEqual([{ '17': 5 }, { '17': 5, '18': 4 }])
  })

  it('el reenvío en curso de un jugador no frena el del jugador al que se cambia', async () => {
    respaldoPendiente('p1', { 7: 5 })
    respaldoPendiente('p2', { 7: 4 })
    mockRpc.mockImplementationOnce(() => new Promise(() => {}))
    const { rerender } = renderHook(useScorer, { initialProps: { isOnline: true, jugadorId: 'p1' } })
    rerender({ isOnline: true, jugadorId: 'p2' })
    expect(mockRpc.mock.calls.map(([, args]) => args.p_jugador_id)).toEqual(['p1', 'p2'])
  })

  it('un guardado que termina después de un golpe más nuevo no deja el respaldo como sincronizado', async () => {
    const { result } = renderHook(useScorer, { initialProps: { isOnline: true } })
    let responder!: () => void
    mockRpc.mockImplementationOnce(() => new Promise(res => { responder = () => res({ data: {}, error: null }) }))
    await act(async () => { await result.current.saveScores('p1', { 17: 5 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    await act(async () => { await result.current.saveScores('p1', { 17: 5, 18: 4 }) })
    await act(async () => { responder(); await Promise.resolve() })
    expect(JSON.parse(localStorage.getItem('golfers_score_ABC123_p1')!).sincronizado).toBe(false)
  })

  it('mientras Finalizar corre no reenvía aunque vuelva la señal; al terminar, sí', async () => {
    const { result, rerender } = renderHook(useScorer, { initialProps: { isOnline: false, finalizando: false } })
    await act(async () => { await result.current.saveScores('p1', { 17: 5 }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    rerender({ isOnline: true, finalizando: true })
    expect(mockRpc).not.toHaveBeenCalled()
    rerender({ isOnline: true, finalizando: false })
    expect(deltas()).toEqual([{ '17': 5 }])
  })
})
