// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/data/tournaments/lifecycle', () => ({
  startTournament: vi.fn().mockResolvedValue(undefined),
  closeTournament: vi.fn().mockResolvedValue(undefined),
  cancelTournament: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useTournamentLifecycle } from './useTournamentLifecycle'

describe('useTournamentLifecycle', () => {
  it('start cambia status local a in_progress', async () => {
    const { result } = renderHook(() =>
      useTournamentLifecycle({ tournamentId: 't1', initialStatus: 'draft' })
    )
    expect(result.current.status).toBe('draft')
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('in_progress')
  })

  it('close cambia status local a closed', async () => {
    const { result } = renderHook(() =>
      useTournamentLifecycle({ tournamentId: 't1', initialStatus: 'in_progress' })
    )
    await act(async () => {
      await result.current.close()
    })
    expect(result.current.status).toBe('closed')
  })

  it('cancel cambia status local a cancelled', async () => {
    const { result } = renderHook(() =>
      useTournamentLifecycle({ tournamentId: 't1', initialStatus: 'draft' })
    )
    await act(async () => {
      await result.current.cancel()
    })
    expect(result.current.status).toBe('cancelled')
  })
})
