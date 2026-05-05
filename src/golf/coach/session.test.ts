import { describe, it, expect, vi } from 'vitest'
import { getOrCreateActiveSession } from './session'

function mockSupabase(existing: { id: string } | null) {
  const insertReturn = { data: { id: 'new-session-id' }, error: null }
  const selectReturn = { data: existing, error: null }

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve(selectReturn)),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(insertReturn)),
        })),
      })),
    })),
  }
}

describe('getOrCreateActiveSession', () => {
  it('returns existing primary session when one exists', async () => {
    const supabase = mockSupabase({ id: 'existing-id' })
    const result = await getOrCreateActiveSession(supabase as never, 'user-1')
    expect(result.id).toBe('existing-id')
    expect(result.created).toBe(false)
  })

  it('creates a new primary session when none exists', async () => {
    const supabase = mockSupabase(null)
    const result = await getOrCreateActiveSession(supabase as never, 'user-1')
    expect(result.id).toBe('new-session-id')
    expect(result.created).toBe(true)
  })

  it('throws when insert fails', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'duplicate' } })),
          })),
        })),
      })),
    }
    await expect(getOrCreateActiveSession(supabase as never, 'user-1')).rejects.toThrow(/duplicate/)
  })
})
