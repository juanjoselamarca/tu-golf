// Tests de la capa de datos del scorer del organizador.
//
// Lo crítico: `fetchResumenBoardInputs` tiene que pedir EXACTAMENTE lo que pide
// el board público (`LEGACY_PLAYER_SELECT` + mismo filtro de status) — si las
// listas divergen, el Resumen y el board reparten handicaps distintos. Y los
// errores se PROPAGAN: "sin jugadores" y "no pude preguntar" no son lo mismo.

import { describe, it, expect, vi } from 'vitest'
import {
  fetchResumenBoardInputs,
  fetchScoringRoster,
  fetchScoringTournament,
  updatePlayerHandicap,
} from './scoring'
import { LEGACY_PLAYER_SELECT } from './leaderboard'

type Result = { data: unknown; error?: unknown }

/** Cliente Supabase mínimo ruteado por tabla. */
function supabaseMock(byTable: Record<string, Result>) {
  const calls: Record<string, { select?: string; in?: [string, unknown[]] }> = {}
  const from = vi.fn((table: string) => {
    const result = { data: byTable[table]?.data ?? null, error: byTable[table]?.error ?? null }
    calls[table] = {}
    const chain = {
      select: vi.fn((cols: string) => {
        calls[table].select = cols
        return chain
      }),
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(result)),
      in: vi.fn((col: string, vals: unknown[]) => {
        calls[table].in = [col, vals]
        return Promise.resolve(result)
      }),
      single: vi.fn(() => Promise.resolve(result)),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
      then: (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
    }
    return chain
  })
  return { client: { from } as never, calls }
}

describe('fetchScoringTournament', () => {
  it('pide las columnas del board (modo_juego / formato_juego) además de las del scorer', async () => {
    const { client, calls } = supabaseMock({ tournaments: { data: { id: 't1' } } })
    await fetchScoringTournament(client, 'mi-torneo')
    for (const col of ['modo_juego', 'formato_juego', 'hcp_calc_mode', 'hole_count', 'total_rounds']) {
      expect(calls.tournaments.select).toContain(col)
    }
  })

  it('0 filas (PGRST116) → null; otro error → propaga', async () => {
    const notFound = supabaseMock({ tournaments: { data: null, error: { code: 'PGRST116' } } })
    expect(await fetchScoringTournament(notFound.client, 'x')).toBeNull()

    const boom = supabaseMock({ tournaments: { data: null, error: { code: '500', message: 'boom' } } })
    await expect(fetchScoringTournament(boom.client, 'x')).rejects.toBeTruthy()
  })
})

describe('fetchScoringRoster', () => {
  it('error de query → propaga (antes se degradaba a "Sin jugadores inscritos")', async () => {
    const { client } = supabaseMock({ players: { data: null, error: { message: 'boom' } } })
    await expect(fetchScoringRoster(client, 't1')).rejects.toBeTruthy()
  })
})

describe('fetchResumenBoardInputs', () => {
  it('usa LEGACY_PLAYER_SELECT y el MISMO filtro de status que el board público', async () => {
    const { client, calls } = supabaseMock({
      players: { data: [] },
      tournaments: { data: { tees: null, hcp_calc_mode: null, courses: null } },
    })
    const { dbPlayers, hcp } = await fetchResumenBoardInputs(client, 't1')
    expect(dbPlayers).toEqual([])
    expect(hcp.mode).toBeNull()
    // La MISMA lista de columnas que alimenta a buildLeaderboardFromLegacy en
    // /torneo, /tv y /en-vivo (incluye hole_scores para derivar el neto).
    expect(calls.players.select).toBe(LEGACY_PLAYER_SELECT)
    expect(calls.players.in).toEqual(['status', ['pending', 'approved', 'waitlist']])
  })

  it('error en players → propaga (el Resumen muestra error con reintento, no un board vacío)', async () => {
    const { client } = supabaseMock({
      players: { data: null, error: { message: 'boom' } },
      tournaments: { data: { tees: null, hcp_calc_mode: null, courses: null } },
    })
    await expect(fetchResumenBoardInputs(client, 't1')).rejects.toBeTruthy()
  })
})

describe('updatePlayerHandicap', () => {
  it('error de update → propaga (el hook muestra el toast)', async () => {
    const { client } = supabaseMock({ players: { data: null, error: { message: 'rls' } } })
    await expect(updatePlayerHandicap(client, 'p1', 12.4)).rejects.toBeTruthy()
  })
})
