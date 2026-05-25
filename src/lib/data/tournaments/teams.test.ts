/**
 * teams.test.ts — unit tests del módulo de equipos a nivel torneo.
 *
 * Estrategia: mockear el `SupabaseClient` con un chain builder que registra
 * cada llamada (`from`, `select`, `eq`, `order`, `single`, etc.) y devuelve
 * la respuesta configurada. Permite verificar la query construida sin
 * tocar BD ni la red.
 *
 * `captureError` está mockeado a no-op para no requerir env vars de PostHog
 * ni golpear `error_logs` durante el run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listTeams,
  getTeamWithMembers,
  createTeam,
  updateTeam,
  deleteTeam,
  assignPlayerToTeam,
  removeMemberByPlayerId,
} from './teams'

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}))

interface ChainResponse {
  data?: unknown
  error?: unknown
}

/** Crea un chain builder mock para una única tabla. Cualquier método de
 * concatenación devuelve `chain`. `single`/`maybeSingle` y el thenable
 * (await directo) resuelven con `response`. Si se necesita simular dos
 * `from(...)` distintos con responses distintas en una misma llamada de
 * la función bajo test, ver `mockSupabaseSequential`. */
function mockChain(response: ChainResponse) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (r: ChainResponse) => unknown) => Promise<unknown>
  } = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    chain[k].mockReturnValue(chain)
  }
  chain.single.mockResolvedValue(response)
  chain.maybeSingle.mockResolvedValue(response)
  chain.then = (resolve) => Promise.resolve(response).then(resolve)
  return chain
}

/** El primer arg de `listTeams` define el shape de SupabaseClient esperado
 * por el módulo. Lo reusamos como cast destino para los mocks. */
type AnySupabase = Parameters<typeof listTeams>[0]

/** Para funciones que llaman `from()` dos veces (ej. `getTeamWithMembers`).
 * Devuelve un mock cliente que sirve `responses[i]` en orden de invocación. */
function mockSupabaseSequential(responses: ChainResponse[]) {
  const chains = responses.map(mockChain)
  let idx = 0
  const fromMock = vi.fn(() => chains[idx++])
  return {
    supabase: { from: fromMock } as unknown as AnySupabase,
    fromMock,
    chains,
  }
}

function mockSupabase(response: ChainResponse) {
  const chain = mockChain(response)
  const fromMock = vi.fn().mockReturnValue(chain)
  return {
    supabase: { from: fromMock } as unknown as AnySupabase,
    fromMock,
    chain,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── listTeams ─────────────────────────────────────────────────────────────

describe('listTeams', () => {
  it('selecciona tournament_teams filtrado por tournament_id y ordenado por position', async () => {
    const teams = [
      {
        id: 't1',
        tournament_id: 'tour1',
        name: 'Equipo 1',
        color: null,
        position: 1,
        created_at: '2026-05-25T00:00:00Z',
      },
      {
        id: 't2',
        tournament_id: 'tour1',
        name: 'Equipo 2',
        color: '#ff0000',
        position: 2,
        created_at: '2026-05-25T00:00:00Z',
      },
    ]
    const { supabase, fromMock, chain } = mockSupabase({
      data: teams,
      error: null,
    })
    const result = await listTeams(supabase, 'tour1')

    expect(result).toEqual(teams)
    expect(fromMock).toHaveBeenCalledWith('tournament_teams')
    expect(chain.select).toHaveBeenCalledOnce()
    expect(chain.eq).toHaveBeenCalledWith('tournament_id', 'tour1')
    expect(chain.order).toHaveBeenCalledWith('position', { ascending: true })
  })

  it('devuelve array vacío cuando data es null', async () => {
    const { supabase } = mockSupabase({ data: null, error: null })
    expect(await listTeams(supabase, 'tour1')).toEqual([])
  })

  it('tira el error original cuando la query falla', async () => {
    const err = new Error('PG: relation does not exist')
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(listTeams(supabase, 'tour1')).rejects.toThrow(
      'PG: relation does not exist',
    )
  })
})

// ─── getTeamWithMembers ────────────────────────────────────────────────────

describe('getTeamWithMembers', () => {
  const team = {
    id: 't1',
    tournament_id: 'tour1',
    name: 'Equipo 1',
    color: null,
    position: 1,
    created_at: '2026-05-25T00:00:00Z',
  }
  const player1 = {
    id: 'p1',
    tournament_id: 'tour1',
    user_id: 'u1',
    status: 'approved',
    created_at: '2026-05-25T00:00:00Z',
  }
  const player2 = {
    id: 'p2',
    tournament_id: 'tour1',
    user_id: 'u2',
    status: 'approved',
    created_at: '2026-05-25T00:00:00Z',
  }

  it('devuelve team + miembros expandidos a Player', async () => {
    const { supabase, fromMock, chains } = mockSupabaseSequential([
      { data: team, error: null },
      {
        data: [
          { position: 1, players: player1 },
          { position: 2, players: player2 },
        ],
        error: null,
      },
    ])
    const result = await getTeamWithMembers(supabase, 't1')
    expect(result).toEqual({ team, members: [player1, player2] })
    expect(fromMock).toHaveBeenNthCalledWith(1, 'tournament_teams')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'tournament_team_members')
    expect(chains[1].eq).toHaveBeenCalledWith('team_id', 't1')
    expect(chains[1].order).toHaveBeenCalledWith('position', {
      ascending: true,
      nullsFirst: false,
    })
  })

  it('devuelve null cuando el equipo no existe', async () => {
    const { supabase } = mockSupabaseSequential([
      { data: null, error: null },
    ])
    expect(await getTeamWithMembers(supabase, 'nope')).toBeNull()
  })

  it('filtra rows con players null (FK órfana defensiva)', async () => {
    const { supabase } = mockSupabaseSequential([
      { data: team, error: null },
      {
        data: [
          { position: 1, players: player1 },
          { position: 2, players: null },
        ],
        error: null,
      },
    ])
    const result = await getTeamWithMembers(supabase, 't1')
    expect(result?.members).toEqual([player1])
  })

  it('tira si la primera query falla', async () => {
    const err = new Error('team query failed')
    const { supabase } = mockSupabaseSequential([
      { data: null, error: err },
    ])
    await expect(getTeamWithMembers(supabase, 't1')).rejects.toThrow(
      'team query failed',
    )
  })

  it('tira si la segunda query (members) falla', async () => {
    const err = new Error('members query failed')
    const { supabase } = mockSupabaseSequential([
      { data: team, error: null },
      { data: null, error: err },
    ])
    await expect(getTeamWithMembers(supabase, 't1')).rejects.toThrow(
      'members query failed',
    )
  })
})

// ─── createTeam ────────────────────────────────────────────────────────────

describe('createTeam', () => {
  it('inserta con color null por defecto y devuelve el row', async () => {
    const created = {
      id: 't1',
      tournament_id: 'tour1',
      name: 'Equipo 1',
      color: null,
      position: 1,
      created_at: '2026-05-25T00:00:00Z',
    }
    const { supabase, chain } = mockSupabase({ data: created, error: null })
    const result = await createTeam(supabase, 'tour1', {
      name: 'Equipo 1',
      position: 1,
    })

    expect(result).toEqual(created)
    expect(chain.insert).toHaveBeenCalledWith({
      tournament_id: 'tour1',
      name: 'Equipo 1',
      position: 1,
      color: null,
    })
  })

  it('respeta color si viene en el input', async () => {
    const created = {
      id: 't1',
      tournament_id: 'tour1',
      name: 'Equipo 1',
      color: '#00ff00',
      position: 1,
      created_at: '2026-05-25T00:00:00Z',
    }
    const { supabase, chain } = mockSupabase({ data: created, error: null })
    await createTeam(supabase, 'tour1', {
      name: 'Equipo 1',
      position: 1,
      color: '#00ff00',
    })
    expect(chain.insert).toHaveBeenCalledWith({
      tournament_id: 'tour1',
      name: 'Equipo 1',
      position: 1,
      color: '#00ff00',
    })
  })

  it('propaga el error de la BD (ej. unique violation)', async () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505' })
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(
      createTeam(supabase, 'tour1', { name: 'Equipo 1', position: 1 }),
    ).rejects.toThrow('duplicate key')
  })
})

// ─── updateTeam ────────────────────────────────────────────────────────────

describe('updateTeam', () => {
  it('llama update con los fields y filtra por id', async () => {
    const updated = {
      id: 't1',
      tournament_id: 'tour1',
      name: 'Equipo Cambiado',
      color: '#0000ff',
      position: 2,
      created_at: '2026-05-25T00:00:00Z',
    }
    const { supabase, chain } = mockSupabase({ data: updated, error: null })
    const result = await updateTeam(supabase, 't1', {
      name: 'Equipo Cambiado',
      color: '#0000ff',
      position: 2,
    })

    expect(result).toEqual(updated)
    expect(chain.update).toHaveBeenCalledWith({
      name: 'Equipo Cambiado',
      color: '#0000ff',
      position: 2,
    })
    expect(chain.eq).toHaveBeenCalledWith('id', 't1')
  })

  it('propaga el error', async () => {
    const err = new Error('update failed')
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(updateTeam(supabase, 't1', { name: 'X' })).rejects.toThrow(
      'update failed',
    )
  })
})

// ─── deleteTeam ────────────────────────────────────────────────────────────

describe('deleteTeam', () => {
  it('borra filtrando por id', async () => {
    const { supabase, chain } = mockSupabase({ data: null, error: null })
    await deleteTeam(supabase, 't1')
    expect(chain.delete).toHaveBeenCalledOnce()
    expect(chain.eq).toHaveBeenCalledWith('id', 't1')
  })

  it('propaga el error', async () => {
    const err = new Error('delete failed')
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(deleteTeam(supabase, 't1')).rejects.toThrow('delete failed')
  })
})

// ─── assignPlayerToTeam ────────────────────────────────────────────────────

describe('assignPlayerToTeam', () => {
  it('inserta el row de membership y devuelve el TeamMember', async () => {
    const member = {
      id: 'm1',
      team_id: 't1',
      player_id: 'p1',
      position: null,
      created_at: '2026-05-25T00:00:00Z',
    }
    const { supabase, chain } = mockSupabase({ data: member, error: null })
    const result = await assignPlayerToTeam(supabase, 't1', 'p1')

    expect(result).toEqual(member)
    expect(chain.insert).toHaveBeenCalledWith({
      team_id: 't1',
      player_id: 'p1',
    })
  })

  it('propaga unique violation cuando el jugador ya está en un equipo', async () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505' })
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(assignPlayerToTeam(supabase, 't1', 'p1')).rejects.toThrow(
      'duplicate key',
    )
  })
})

// ─── removeMemberByPlayerId ────────────────────────────────────────────────

describe('removeMemberByPlayerId', () => {
  it('borra membership filtrada por player_id (idempotente)', async () => {
    const { supabase, fromMock, chain } = mockSupabase({
      data: null,
      error: null,
    })
    await removeMemberByPlayerId(supabase, 'p1')
    expect(fromMock).toHaveBeenCalledWith('tournament_team_members')
    expect(chain.delete).toHaveBeenCalledOnce()
    expect(chain.eq).toHaveBeenCalledWith('player_id', 'p1')
  })

  it('propaga el error', async () => {
    const err = new Error('delete failed')
    const { supabase } = mockSupabase({ data: null, error: err })
    await expect(removeMemberByPlayerId(supabase, 'p1')).rejects.toThrow(
      'delete failed',
    )
  })
})
