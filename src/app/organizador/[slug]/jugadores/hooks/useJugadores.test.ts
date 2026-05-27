// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/data/tournaments/players', () => ({
  listPlayers: vi.fn().mockResolvedValue([
    { id: 'p1', tee_id: null, profiles: { name: 'A' }, categories: null, status: 'approved' },
  ]),
  inscribePlayer: vi.fn().mockResolvedValue({ id: 'p2' }),
  withdrawPlayer: vi.fn().mockResolvedValue(undefined),
  disqualifyPlayer: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useJugadores } from './useJugadores'

describe('useJugadores', () => {
  it('expone players + handlers', () => {
    const initial = [{ id: 'p1', tee_id: null } as never]
    const { result } = renderHook(() =>
      useJugadores({ tournamentId: 't1', initialPlayers: initial })
    )
    expect(result.current.players).toEqual(initial)
    expect(typeof result.current.inscribir).toBe('function')
    expect(typeof result.current.desinscribir).toBe('function')
    expect(typeof result.current.descalificar).toBe('function')
    expect(typeof result.current.refresh).toBe('function')
  })

  it('refresh recarga la lista desde listPlayers', async () => {
    const { result } = renderHook(() =>
      useJugadores({ tournamentId: 't1', initialPlayers: [] })
    )
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.players.length).toBe(1))
  })
})
