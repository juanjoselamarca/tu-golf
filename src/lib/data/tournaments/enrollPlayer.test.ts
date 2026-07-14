import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enrollPlayer, tournamentCapacity } from './enrollPlayer'

/**
 * Mock para `tournamentCapacity` (lee vía .from — lo usa cupo.ts para no bajar
 * el cupo por debajo de los inscritos).
 */
function makeCapacityMock(opts: { maxPlayers?: number | null; approvedCount?: number }): SupabaseClient {
  return {
    from: vi.fn((tabla: string) => {
      if (tabla === 'tournaments') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { max_players: opts.maxPlayers ?? null }, error: null }),
            }),
          }),
        }
      }
      if (tabla === 'players') {
        const cnt = opts.approvedCount ?? 0
        return {
          select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: cnt, error: null }) }) }),
        }
      }
      throw new Error(`tabla inesperada: ${tabla}`)
    }),
  } as unknown as SupabaseClient
}

/**
 * Mock para `enrollPlayer`: cupo + INSERT players + INSERT rounds viven ahora en
 * el RPC atómico `enroll_player` (migrations/20260713_enroll_player_rpc.sql,
 * verificado contra prod). El unit test cubre lo que queda en JS: el gate de
 * status, el mapeo de args → parámetros del RPC y el mapeo del jsonb → EnrollResult.
 */
function makeRpcMock(result: {
  data?: unknown
  error?: { message: string } | null
}): { client: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(() =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  )
  const client = { rpc } as unknown as SupabaseClient
  return { client, rpc }
}

describe('tournamentCapacity', () => {
  it('sin max_players → nunca lleno', async () => {
    const cap = await tournamentCapacity(makeCapacityMock({ maxPlayers: null, approvedCount: 99 }), 't1')
    expect(cap.full).toBe(false)
    expect(cap.maxPlayers).toBeNull()
  })

  it('approved >= max_players → lleno', async () => {
    const cap = await tournamentCapacity(makeCapacityMock({ maxPlayers: 24, approvedCount: 24 }), 't1')
    expect(cap.full).toBe(true)
    expect(cap.maxPlayers).toBe(24)
    expect(cap.approved).toBe(24)
  })

  it('approved < max_players → no lleno', async () => {
    const cap = await tournamentCapacity(makeCapacityMock({ maxPlayers: 24, approvedCount: 23 }), 't1')
    expect(cap.full).toBe(false)
  })
})

describe('enrollPlayer — gate de status (en JS) + delega en el RPC atómico', () => {
  it('status gate ON + torneo draft → not_inscribible SIN llamar al RPC', async () => {
    const { client, rpc } = makeRpcMock({ data: { ok: true, player_id: 'p1' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      enforceStatusGate: true,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not_inscribible')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('status gate OFF + torneo draft → el organizador SÍ inscribe (llama al RPC)', async () => {
    const { client, rpc } = makeRpcMock({ data: { ok: true, player_id: 'p-abc' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.playerId).toBe('p-abc')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('REGISTRADO → mapea user_id (guest_name null) y devuelve playerId', async () => {
    const { client, rpc } = makeRpcMock({ data: { ok: true, player_id: 'p-reg' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
      categoryId: 'cat1',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.playerId).toBe('p-reg')
    expect(rpc).toHaveBeenCalledWith('enroll_player', {
      p_tournament_id: 't1',
      p_kind: 'registered',
      p_user_id: 'u1',
      p_guest_name: null,
      p_handicap: 12,
      p_category_id: 'cat1',
    })
  })

  it('INVITADO → mapea guest_name (user_id null) y category null por default', async () => {
    const { client, rpc } = makeRpcMock({ data: { ok: true, player_id: 'p-guest' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'draft',
      identity: { kind: 'guest', guestName: 'Ana Gómez' },
      handicapAtRegistration: 20,
      enforceStatusGate: false,
    })
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('enroll_player', {
      p_tournament_id: 't1',
      p_kind: 'guest',
      p_user_id: null,
      p_guest_name: 'Ana Gómez',
      p_handicap: 20,
      p_category_id: null,
    })
  })

  it('RPC devuelve tournament_full → reason tournament_full', async () => {
    const { client } = makeRpcMock({ data: { ok: false, reason: 'tournament_full', message: 'lleno' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('tournament_full')
  })

  it('RPC devuelve already_registered → reason already_registered', async () => {
    const { client } = makeRpcMock({ data: { ok: false, reason: 'already_registered', message: 'dup' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('already_registered')
  })

  it('RPC devuelve error de postgres → reason unknown', async () => {
    const { client } = makeRpcMock({ data: null, error: { message: 'deadlock detected' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      tournamentStatus: 'open',
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown')
  })
})
