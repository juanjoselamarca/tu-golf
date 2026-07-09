import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enrollPlayer, tournamentCapacity } from './enrollPlayer'

/**
 * Mock de SupabaseClient que cubre las 4 llamadas de enrollPlayer:
 *  1. tournaments.select('max_players').eq().single()      → maxPlayers
 *  2. players.select(count).eq().eq()                        → approvedCount
 *  3. players.insert().select('id').single()                → inserted row / error
 *  4. rounds.insert()                                        → round best-effort
 * Registra las filas insertadas en `captured` para asertar el shape.
 */
function makeMock(opts: {
  maxPlayers?: number | null
  approvedCount?: number
  playersInsert?: { data: unknown; error?: { message: string; code?: string } | null }
  roundsInsertError?: { message: string } | null
}): { client: SupabaseClient; captured: { players: Record<string, unknown>[]; rounds: Record<string, unknown>[] } } {
  const captured = { players: [] as Record<string, unknown>[], rounds: [] as Record<string, unknown>[] }
  const client = {
    from: vi.fn((tabla: string) => {
      if (tabla === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { max_players: opts.maxPlayers ?? null }, error: null }),
            }),
          }),
        }
      }
      if (tabla === 'players') {
        const ins = opts.playersInsert ?? { data: { id: 'p-new' }, error: null }
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
          insert: (row: Record<string, unknown>) => {
            captured.players.push(row)
            return { select: () => ({ single: () => Promise.resolve(ins) }) }
          },
        }
      }
      if (tabla === 'rounds') {
        return {
          insert: (row: Record<string, unknown>) => {
            captured.rounds.push(row)
            return Promise.resolve({ error: opts.roundsInsertError ?? null })
          },
        }
      }
      throw new Error(`tabla inesperada: ${tabla}`)
    }),
  } as unknown as SupabaseClient
  return { client, captured }
}

describe('tournamentCapacity', () => {
  it('sin max_players → nunca lleno', async () => {
    const { client } = makeMock({ maxPlayers: null, approvedCount: 99 })
    const cap = await tournamentCapacity(client, 't1')
    expect(cap.full).toBe(false)
    expect(cap.maxPlayers).toBeNull()
  })

  it('approved >= max_players → lleno', async () => {
    const { client } = makeMock({ maxPlayers: 24, approvedCount: 24 })
    const cap = await tournamentCapacity(client, 't1')
    expect(cap.full).toBe(true)
    expect(cap.maxPlayers).toBe(24)
    expect(cap.approved).toBe(24)
  })

  it('approved < max_players → no lleno', async () => {
    const { client } = makeMock({ maxPlayers: 24, approvedCount: 23 })
    const cap = await tournamentCapacity(client, 't1')
    expect(cap.full).toBe(false)
  })
})

describe('enrollPlayer — cupo enforced (los 3 caminos usan esta función)', () => {
  it('REGISTRADO por encima del cupo → tournament_full (rechazado, sin insertar)', async () => {
    const { client, captured } = makeMock({ maxPlayers: 24, approvedCount: 24 })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('tournament_full')
    expect(captured.players).toHaveLength(0)
  })

  it('INVITADO por encima del cupo → tournament_full (rechazado, sin insertar)', async () => {
    const { client, captured } = makeMock({ maxPlayers: 24, approvedCount: 24 })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'guest', guestName: 'Juan Pérez' },
      handicapAtRegistration: 18.4,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('tournament_full')
    expect(captured.players).toHaveLength(0)
  })

  it('REGISTRADO bajo el cupo → ok e inserta user_id', async () => {
    const { client, captured } = makeMock({ maxPlayers: 24, approvedCount: 23, playersInsert: { data: { id: 'p-abc' }, error: null } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      categoryId: 'cat1',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.playerId).toBe('p-abc')
    expect(captured.players[0]).toMatchObject({ tournament_id: 't1', user_id: 'u1', category_id: 'cat1', handicap_at_registration: 12, status: 'approved' })
    expect(captured.rounds).toHaveLength(1)
  })

  it('INVITADO bajo el cupo → ok, inserta pending_user_id + player_name, user_id null', async () => {
    const { client, captured } = makeMock({ maxPlayers: 24, approvedCount: 0 })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'guest', guestName: 'Ana Gómez' },
      handicapAtRegistration: 20,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(true)
    expect(captured.players[0]).toMatchObject({ user_id: null, player_name: 'Ana Gómez', handicap_at_registration: 20, status: 'approved' })
    expect(typeof captured.players[0].pending_user_id).toBe('string')
  })

  it('sin cupo configurado (max_players null) → acepta aunque haya muchos', async () => {
    const { client } = makeMock({ maxPlayers: null, approvedCount: 500 })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 5,
    })
    expect(res.ok).toBe(true)
  })

  it('ORGANIZADOR AMPLÍA el cupo → lo que antes estaba lleno ahora acepta', async () => {
    // Antes: 24/24 lleno. El organizador subió max_players a 26 → approved 24 < 26.
    const { client, captured } = makeMock({ maxPlayers: 26, approvedCount: 24 })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u25' },
      handicapAtRegistration: 10,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(true)
    expect(captured.players).toHaveLength(1)
  })

  it('status gate ON + torneo draft → not_inscribible (self-service no puede)', async () => {
    const { client, captured } = makeMock({ maxPlayers: null })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      enforceStatusGate: true,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not_inscribible')
    expect(captured.players).toHaveLength(0)
  })

  it('status gate OFF + torneo draft → el organizador SÍ puede inscribir', async () => {
    const { client } = makeMock({ maxPlayers: null })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(true)
  })

  it('insert duplicado → already_registered', async () => {
    const { client } = makeMock({ maxPlayers: null, playersInsert: { data: null, error: { message: 'duplicate key value', code: '23505' } } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('already_registered')
  })
})
