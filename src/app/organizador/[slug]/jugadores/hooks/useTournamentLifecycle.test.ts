// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ─── Mock de supabase que registra los inserts por tabla ───
//
// Cada nodo del builder es "thenable" (resuelve a { data, error }) para soportar
// tanto los awaits directos (`.eq()`, `.insert(rows)`) como las cadenas que
// terminan en `.single()`. Los inserts se acumulan en `inserts[tabla]` y
// `.select().single()` devuelve un id secuencial por tabla.

interface Recorded {
  inserts: Record<string, unknown[]>
}

function makeSupabase(rec: Recorded) {
  const counters: Record<string, number> = {}
  let lastInsertTable = ''

  function node(table: string, resolved: { data: unknown; error: unknown }): any {
    const result = Promise.resolve(resolved)
    return {
      // chainables — devuelven otro nodo que resuelve a lista vacía por defecto
      select: () => node(table, { data: [], error: null }),
      eq: () => node(table, { data: [], error: null }),
      in: () => node(table, { data: [], error: null }),
      order: () => node(table, { data: [], error: null }),
      // single() resuelve a la fila configurada (id secuencial para inserts)
      single: () => {
        if (table === lastInsertTable) {
          counters[table] = (counters[table] ?? 0) + 1
          return Promise.resolve({ data: { id: `${table}-${counters[table]}` }, error: null })
        }
        return result
      },
      // permite await directo del nodo
      then: (onF: (v: unknown) => unknown) => result.then(onF),
    }
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: 'creador-1' } } }) },
    from: (table: string) => ({
      select: () => node(table, { data: [], error: null }),
      update: () => node(table, { data: null, error: null }),
      insert: (payload: unknown) => {
        rec.inserts[table] = rec.inserts[table] ?? []
        const rows = Array.isArray(payload) ? payload : [payload]
        rec.inserts[table].push(...rows)
        lastInsertTable = table
        return node(table, { data: null, error: null })
      },
    }),
  }
}

const recorded: Recorded = { inserts: {} }
const pushMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createClient: () => makeSupabase(recorded),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { useTournamentLifecycle } from './useTournamentLifecycle'
import type { Player, Tournament, TournamentGroup } from '../types'

function buildArgs(format: string | undefined) {
  const tournament = {
    id: 't1',
    name: 'Test',
    slug: 'test',
    course_id: 'c1',
    status: 'inscripcion',
    format,
    courses: { slope_rating: 113, course_rating: 72, par_total: 72, nombre: 'Cancha' },
    hole_count: 18,
  } as unknown as Tournament

  const players: Player[] = [
    { id: 'p1', user_id: 'u1', handicap_at_registration: 99, status: 'approved', profiles: { name: 'Ana', email: 'a@a.cl', indice: 10 }, categories: null },
    { id: 'p2', user_id: 'u2', handicap_at_registration: 99, status: 'approved', profiles: { name: 'Beto', email: 'b@b.cl', indice: 20 }, categories: null },
  ]

  const groups: TournamentGroup[] = [
    {
      id: 'g1',
      name: 'Equipo 1',
      tee_time: null,
      sort_order: 0,
      ronda_libre_id: null,
      players: [
        { id: 'gp1', player_id: 'p1', playerName: 'Ana' },
        { id: 'gp2', player_id: 'p2', playerName: 'Beto' },
      ],
    },
  ]

  return { tournament, players, groups, setTournamentStatus: vi.fn() }
}

describe('useTournamentLifecycle.handleStartTournament — productor de equipos', () => {
  beforeEach(() => {
    recorded.inserts = {}
    pushMock.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('scramble: crea ronda_equipos con handicap USGA + miembros ordenados + formato_juego en la ronda', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgs('scramble')))
    await act(async () => {
      await result.current.handleStartTournament()
    })

    // La ronda lleva formato_juego para que score-grupo enganche el equipo.
    const ronda = recorded.inserts['rondas_libres']?.[0] as { formato_juego?: string }
    expect(ronda?.formato_juego).toBe('scramble')

    // Se creó exactamente un ronda_equipos con el handicap canónico (0.35*10 + 0.15*20 = 6.5).
    const equipos = recorded.inserts['ronda_equipos'] as Array<{ nombre: string; handicap_equipo: number | null; ronda_id: string }>
    expect(equipos).toHaveLength(1)
    expect(equipos[0].nombre).toBe('Equipo 1')
    expect(equipos[0].handicap_equipo).toBe(6.5)

    // Dos miembros, ordenados, apuntando a los ronda_libre_jugadores creados.
    const miembros = recorded.inserts['ronda_equipo_jugadores'] as Array<{ jugador_id: string; orden: number; equipo_id: string }>
    expect(miembros).toHaveLength(2)
    expect(miembros.map((m) => m.orden)).toEqual([0, 1])
    expect(miembros.every((m) => m.equipo_id === 'ronda_equipos-1')).toBe(true)
    expect(miembros[0].jugador_id).toBe('ronda_libre_jugadores-1')
    expect(miembros[1].jugador_id).toBe('ronda_libre_jugadores-2')

    // Los jugadores llevan su handicap resuelto (índice).
    const jugadores = recorded.inserts['ronda_libre_jugadores'] as Array<{ handicap: number }>
    expect(jugadores.map((j) => j.handicap)).toEqual([10, 20])
  })

  it('formato individual: NO crea ronda_equipos y la ronda no lleva formato_juego', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgs('stroke_play')))
    await act(async () => {
      await result.current.handleStartTournament()
    })

    expect(recorded.inserts['ronda_equipos']).toBeUndefined()
    expect(recorded.inserts['ronda_equipo_jugadores']).toBeUndefined()
    const ronda = recorded.inserts['rondas_libres']?.[0] as { formato_juego?: string }
    expect(ronda?.formato_juego).toBeUndefined()
    // Path individual byte-idéntico: ronda_libre_jugadores no lleva handicap.
    const jugadores = recorded.inserts['ronda_libre_jugadores'] as Array<{ handicap?: number }>
    expect(jugadores.every((j) => j.handicap === undefined)).toBe(true)
  })
})
