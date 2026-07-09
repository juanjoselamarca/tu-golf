import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { updateMaxPlayers } from './cupo'

function makeMock(opts: {
  approvedCount?: number
  currentMax?: number | null
  updateError?: { message: string } | null
}): { client: SupabaseClient; updated: (number | null)[] } {
  const updated: (number | null)[] = []
  const client = {
    from: vi.fn((tabla: string) => {
      if (tabla === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { max_players: opts.currentMax ?? null }, error: null }),
            }),
          }),
          update: (row: { max_players: number | null }) => {
            updated.push(row.max_players)
            return { eq: () => Promise.resolve({ error: opts.updateError ?? null }) }
          },
        }
      }
      if (tabla === 'players') {
        const cnt = opts.approvedCount ?? 0
        return {
          select: () => ({
            eq: () => ({
              eq: () => {
                const obj: Record<string, unknown> = { count: cnt, error: null }
                obj.then = (resolve: (v: unknown) => unknown) => resolve({ count: cnt, error: null })
                return obj
              },
            }),
          }),
        }
      }
      throw new Error(`tabla inesperada: ${tabla}`)
    }),
  } as unknown as SupabaseClient
  return { client, updated }
}

describe('updateMaxPlayers — ampliar cupo', () => {
  it('sube el cupo (ampliar) → ok', async () => {
    const { client, updated } = makeMock({ approvedCount: 24, currentMax: 24 })
    const res = await updateMaxPlayers(client, 't1', 30)
    expect(res.ok).toBe(true)
    expect(updated).toEqual([30])
  })

  it('null quita el tope → ok', async () => {
    const { client, updated } = makeMock({ approvedCount: 24, currentMax: 24 })
    const res = await updateMaxPlayers(client, 't1', null)
    expect(res.ok).toBe(true)
    expect(updated).toEqual([null])
  })

  it('no permite bajar por debajo de los inscritos → below_current', async () => {
    const { client, updated } = makeMock({ approvedCount: 24, currentMax: 24 })
    const res = await updateMaxPlayers(client, 't1', 20)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('below_current')
      expect(res.approved).toBe(24)
    }
    expect(updated).toEqual([])
  })

  it('permite fijar exactamente en los inscritos actuales (cerrar cupo) → ok', async () => {
    const { client } = makeMock({ approvedCount: 24, currentMax: null })
    const res = await updateMaxPlayers(client, 't1', 24)
    expect(res.ok).toBe(true)
  })

  it('rechaza valores no enteros o < 1 → invalid_value', async () => {
    const { client } = makeMock({ approvedCount: 0 })
    expect((await updateMaxPlayers(client, 't1', 0)).ok).toBe(false)
    expect((await updateMaxPlayers(client, 't1', -5)).ok).toBe(false)
    expect((await updateMaxPlayers(client, 't1', 3.5)).ok).toBe(false)
  })

  it('propaga error de update → unknown', async () => {
    const { client } = makeMock({ approvedCount: 0, updateError: { message: 'rls denied' } })
    const res = await updateMaxPlayers(client, 't1', 40)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown')
  })
})
