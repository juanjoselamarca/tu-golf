import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
      torneo: { status: 'draft', date_start: null },
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
      torneo: { status: 'draft', date_start: null },
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
      torneo: { status: 'open', date_start: null },
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
      p_genero: null,
    })
  })

  it('INVITADO → mapea guest_name (user_id null) y category null por default', async () => {
    const { client, rpc } = makeRpcMock({ data: { ok: true, player_id: 'p-guest' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      torneo: { status: 'draft', date_start: null },
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
      p_genero: null,
    })
  })

  it('RPC devuelve tournament_full → reason tournament_full', async () => {
    const { client } = makeRpcMock({ data: { ok: false, reason: 'tournament_full', message: 'lleno' } })
    const res = await enrollPlayer(client, {
      tournamentId: 't1',
      torneo: { status: 'open', date_start: null },
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
      torneo: { status: 'open', date_start: null },
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
      torneo: { status: 'open', date_start: null },
      identity: { kind: 'registered', userId: 'u1' },
      handicapAtRegistration: 12,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown')
  })
})

// Invariante "todo jugador del roster tiene su tarjeta": el alta crea `players` y `rounds` en la MISMA
// función (una transacción). Sin la tarjeta, el scorer del torneo no tiene dónde guardar
// (copa-cabros-mo7nce53: 4 de 5 jugadores sin fila en `rounds`, creados antes de este RPC).
describe('enroll_player (schema) — el alta crea la tarjeta de la ronda vigente en la misma transacción', () => {
  const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8').replace(/\r\n/g, '\n')
  const cuerpoDe = (nombre: string) => {
    const i = schema.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`)
    return i === -1 ? '' : schema.slice(i, schema.indexOf('$function$;', i))
  }
  const enroll = cuerpoDe('enroll_player')
  const asegurar = cuerpoDe('asegurar_tarjeta_vigente')
  const LLAMA_ASEGURAR = /PERFORM public\.asegurar_tarjeta_vigente\(p_tournament_id, v_player_id\)/
  const INSERT_PLAYERS = /INSERT INTO (public\.)?players/

  it('enroll_player inserta al jugador y DESPUÉS asegura su tarjeta, antes del único ok: true', () => {
    expect(enroll).not.toBe('')
    const llamada = enroll.search(LLAMA_ASEGURAR)
    expect(llamada).toBeGreaterThan(-1)
    expect(enroll.search(INSERT_PLAYERS)).toBeGreaterThan(-1)
    expect(enroll.search(INSERT_PLAYERS)).toBeLessThan(llamada)
    const oks = [...enroll.matchAll(/'ok', true/g)].map((m) => m.index ?? -1)
    expect(oks).toHaveLength(1)
    expect(oks[0]).toBeGreaterThan(llamada)
  })

  it('enroll_player ya no fija la ronda 1 por su cuenta (alta tardía con la ronda 2 en juego)', () => {
    expect(enroll).not.toMatch(/INSERT INTO (public\.)?rounds/)
  })

  it('asegurar_tarjeta_vigente crea SOLO la tarjeta de la ronda vigente, idempotente', () => {
    expect(asegurar).not.toBe('')
    expect(asegurar).toMatch(/max\(round_number\) INTO v_vigente FROM rounds WHERE tournament_id = p_tournament_id/)
    const inserts = [...asegurar.matchAll(/INSERT INTO (public\.)?rounds[^;]*;/g)].map((m) => m[0])
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatch(/VALUES \(p_tournament_id, p_player_id, v_vigente, 'in_progress'\)/)
    expect(inserts[0]).toMatch(/ON CONFLICT \(tournament_id, player_id, round_number\) DO NOTHING/)
  })

  it('asegurar_tarjeta_vigente no da tarjeta a WD/DQ, ni con el torneo finalizado, ni entre rondas', () => {
    const insert = asegurar.search(/INSERT INTO (public\.)?rounds/)
    for (const guarda of [
      /IF v_pstatus IS DISTINCT FROM 'approved' THEN/,
      /IF v_tstatus IN \('closed', 'published', 'finished'\) THEN/,
      /IF v_vigente < v_total/,
      /status NOT IN \('closed', 'official'\)/,
    ]) {
      const pos = asegurar.search(guarda)
      expect(pos).toBeGreaterThan(-1)
      expect(pos).toBeLessThan(insert)
    }
  })

  it('la migración y el rollback existen y la función queda solo para service_role', () => {
    const mig = readFileSync(join(process.cwd(), 'supabase/migrations/20261118150000_tarjeta_ronda_vigente.sql'), 'utf8')
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.asegurar_tarjeta_vigente\(uuid, uuid\) FROM public, anon, authenticated;/)
    expect(mig).toMatch(/GRANT EXECUTE ON FUNCTION public\.asegurar_tarjeta_vigente\(uuid, uuid\) TO service_role;/)
    expect(schema).not.toMatch(/grant EXECUTE on function public\.asegurar_tarjeta_vigente\(uuid,uuid\) to (anon|authenticated)/)
  })
})
