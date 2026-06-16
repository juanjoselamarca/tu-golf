/**
 * useRoundActions — endurecimiento contra falla silenciosa.
 * Cubre: detección de no-op (0 filas), error real, revert optimista, borrado masivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRoundActions } from '../useRoundActions'
import type { HistoricalRound } from '../../lib/types'

let selectResult: { data: unknown; error: unknown } = { data: [{ id: 'r1' }], error: null }
const rpcSpy = vi.fn(() => Promise.resolve({ data: 5.1, error: null }))

vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    const b: Record<string, unknown> = {}
    b.from = () => b
    b.delete = () => b
    b.update = () => b
    b.eq = () => b
    b.select = () => Promise.resolve(selectResult)
    b.rpc = rpcSpy
    return b
  },
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const round = { id: 'r1', excluded_from_handicap: false } as HistoricalRound

beforeEach(() => { selectResult = { data: [{ id: 'r1' }], error: null }; rpcSpy.mockClear() })

describe('useRoundActions — falla silenciosa', () => {
  it('deleteRound: 1 fila → ok, saca de estado, recalcula índice', async () => {
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.deleteRound('r1') })
    expect(res).toEqual({ ok: true, index: 5.1 })
    expect(setRounds).toHaveBeenCalledTimes(1)
    expect(rpcSpy).toHaveBeenCalledTimes(1)
  })

  it('deleteRound: 0 filas (RLS/no existe) → noop, NO toca la UI ni recalcula', async () => {
    selectResult = { data: [], error: null }
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.deleteRound('r1') })
    expect(res).toEqual({ ok: false, reason: 'noop' })
    expect(setRounds).not.toHaveBeenCalled()
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it('deleteRound: error de query → ok:false reason:error', async () => {
    selectResult = { data: null, error: { message: 'boom' } }
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.deleteRound('r1') })
    expect(res).toEqual({ ok: false, reason: 'error' })
    expect(setRounds).not.toHaveBeenCalled()
  })

  it('toggleExcluded: 0 filas → revert del update optimista', async () => {
    selectResult = { data: [], error: null }
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.toggleExcluded(round) })
    expect(res).toEqual({ ok: false, reason: 'noop' })
    // optimista + revert = 2 llamadas
    expect(setRounds).toHaveBeenCalledTimes(2)
  })

  it('toggleExcluded: 1 fila → ok, sin revert, recalcula', async () => {
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.toggleExcluded(round) })
    expect(res).toEqual({ ok: true, index: 5.1 })
    expect(setRounds).toHaveBeenCalledTimes(1)
    expect(rpcSpy).toHaveBeenCalledTimes(1)
  })

  it('deleteAllRounds: cuenta filas borradas y vacía el estado', async () => {
    selectResult = { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null }
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.deleteAllRounds() })
    expect(res).toEqual({ ok: true, deletedCount: 3, index: 5.1 })
    expect(setRounds).toHaveBeenCalledWith([])
    expect(rpcSpy).toHaveBeenCalledTimes(1)
  })

  it('deleteAllRounds: 0 filas (RLS filtró) → noop, no vacía el estado', async () => {
    selectResult = { data: [], error: null }
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: 'u1', setRounds }))
    let res
    await act(async () => { res = await result.current.deleteAllRounds() })
    expect(res).toEqual({ ok: false, reason: 'noop', deletedCount: 0 })
    expect(setRounds).not.toHaveBeenCalled()
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it('deleteAllRounds: sin userId → no borra nada', async () => {
    const setRounds = vi.fn()
    const { result } = renderHook(() => useRoundActions({ userId: null, setRounds }))
    let res
    await act(async () => { res = await result.current.deleteAllRounds() })
    expect(res).toEqual({ ok: false, reason: 'error', deletedCount: 0 })
    expect(setRounds).not.toHaveBeenCalled()
  })
})
