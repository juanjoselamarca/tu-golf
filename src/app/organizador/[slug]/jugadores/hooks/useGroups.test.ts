// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/data/tournaments/groups', () => ({
  listGroups: vi.fn().mockResolvedValue([
    { id: 'g1', name: 'Grupo 1', tournament_group_players: [] },
  ]),
  createGroup: vi.fn().mockResolvedValue({ id: 'g2' }),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  assignPlayerToGroup: vi.fn().mockResolvedValue(undefined),
  removePlayerFromGroup: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useGroups } from './useGroups'

describe('useGroups', () => {
  it('carga groups al montar y expone handlers', async () => {
    const { result } = renderHook(() => useGroups({ tournamentId: 't1' }))
    await waitFor(() => expect(result.current.groups.length).toBe(1))
    expect(typeof result.current.create).toBe('function')
    expect(typeof result.current.remove).toBe('function')
    expect(typeof result.current.assignPlayer).toBe('function')
    expect(typeof result.current.unassignPlayer).toBe('function')
  })

  it('refresh recarga manualmente', async () => {
    const { result } = renderHook(() => useGroups({ tournamentId: 't1' }))
    await waitFor(() => expect(result.current.groups.length).toBe(1))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.groups.length).toBe(1)
  })
})
