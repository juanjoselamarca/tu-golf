import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishRound } from './rounds'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
import { captureError } from '@/lib/error-tracking'

function makeSupabase(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result)
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { client: { from } as unknown as SupabaseClient, from, update, eq }
}

describe('publishRound', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marca la ronda como public y devuelve true', async () => {
    const { client, from, update, eq } = makeSupabase({ error: null })
    const ok = await publishRound(client, 'round-123')
    expect(ok).toBe(true)
    expect(from).toHaveBeenCalledWith('historical_rounds')
    expect(update).toHaveBeenCalledWith({ privacy: 'public' })
    expect(eq).toHaveBeenCalledWith('id', 'round-123')
    expect(captureError).not.toHaveBeenCalled()
  })

  it('si el update da error: loguea y devuelve false (no lanza)', async () => {
    const err = { code: '42501', message: 'permission denied' }
    const { client } = makeSupabase({ error: err })
    const ok = await publishRound(client, 'round-x')
    expect(ok).toBe(false)
    expect(captureError).toHaveBeenCalledWith(err, { context: 'publishRound', meta: { roundId: 'round-x' } })
  })
})
