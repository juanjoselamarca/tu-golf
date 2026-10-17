import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publishRound } from './rounds'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
import { captureError } from '@/lib/error-tracking'

function makeSupabase(result: { data?: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { client: { from } as unknown as SupabaseClient, from, update, eq, select }
}

describe('publishRound', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marca la ronda como public y devuelve true', async () => {
    const { client, from, update, eq } = makeSupabase({ data: [{ id: 'round-123' }], error: null })
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

  it('0 filas sin error (RLS: no es el dueño o ya no existe) NO es éxito', async () => {
    const { client } = makeSupabase({ data: [], error: null })
    expect(await publishRound(client, 'round-ajena')).toBe(false)
    expect(captureError).toHaveBeenCalled()
  })

  it('si la red falla (lanza): devuelve false, no rompe el botón', async () => {
    const select = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = { from: () => ({ update: () => ({ eq: () => ({ select }) }) }) } as unknown as SupabaseClient
    expect(await publishRound(client, 'round-y')).toBe(false)
  })
})
