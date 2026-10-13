import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const importRound = vi.fn()
const recalcularIndiceGolfers = vi.fn(async () => true)
const actualizarNivelDelJugador = vi.fn(async () => undefined)
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/ronda-libre-finalizar', () => ({
  recalcularIndiceGolfers: (...a: unknown[]) => recalcularIndiceGolfers(...(a as [])),
  actualizarNivelDelJugador: (...a: unknown[]) => actualizarNivelDelJugador(...(a as [])),
}))
vi.mock('@/lib/import-round', async (orig) => ({
  ...(await orig<typeof import('@/lib/import-round')>()),
  importRound: (...a: unknown[]) => importRound(...a),
}))

import { useAddRoundForm } from './useAddRoundForm'

const evento = { preventDefault: () => {} } as React.FormEvent

describe('useAddRoundForm — la ronda manual entra por importRound (#545)', () => {
  beforeEach(() => {
    importRound.mockReset().mockResolvedValue({ success: true, roundId: 'r1', totalGross: 45, totalNeto: null, warnings: [] })
    recalcularIndiceGolfers.mockClear()
  })

  it('back 9: manda los 9 golpes con metadata.hoyos 10..18 y source manual; luego recalcula el índice', async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() => useAddRoundForm({ userId: 'u1', onSaved }))
    act(() => {
      result.current.setCourseName('Los Leones')
      result.current.setTeeColor('Azul')
      result.current.setScores(Array.from({ length: 18 }, (_, i) => (i >= 9 ? 5 : null)))
    })
    expect(result.current.canSave).toBe(true)
    await act(async () => { await result.current.handleSave(evento) })
    expect(importRound).toHaveBeenCalledTimes(1)
    expect(importRound.mock.calls[0][1]).toMatchObject({
      userId: 'u1', courseName: 'Los Leones', teeColor: 'Azul', source: 'manual',
      scores: Array(9).fill(5), holesPlayed: 9, metadata: { hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
    })
    expect(recalcularIndiceGolfers).toHaveBeenCalledWith(expect.anything(), 'u1', expect.anything())
    expect(onSaved).toHaveBeenCalled()
  })

  it('12 hoyos: no deja guardar (una tarjeta a medias bajaría el diferencial)', () => {
    const { result } = renderHook(() => useAddRoundForm({ userId: 'u1', onSaved: vi.fn() }))
    act(() => {
      result.current.setCourseName('Los Leones')
      result.current.setScores(Array.from({ length: 18 }, (_, i) => (i < 12 ? 5 : null)))
    })
    expect(result.current.canSave).toBe(false)
  })

  it('si importRound falla no recalcula ni limpia el formulario', async () => {
    importRound.mockResolvedValue({ success: false, totalGross: 0, totalNeto: null, warnings: ['Error al guardar'] })
    const onSaved = vi.fn()
    const { result } = renderHook(() => useAddRoundForm({ userId: 'u1', onSaved }))
    act(() => {
      result.current.setCourseName('Los Leones')
      result.current.setScores(Array(18).fill(5))
    })
    await act(async () => { await result.current.handleSave(evento) })
    expect(recalcularIndiceGolfers).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.courseName).toBe('Los Leones')
  })
})
