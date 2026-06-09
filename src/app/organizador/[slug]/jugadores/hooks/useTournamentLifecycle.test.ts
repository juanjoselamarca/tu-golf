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
    { id: 'p1', user_id: 'u1', handicap_at_registration: 99, status: 'approved', profiles: { name: 'Ana', indice: 10 }, categories: null },
    { id: 'p2', user_id: 'u2', handicap_at_registration: 99, status: 'approved', profiles: { name: 'Beto', indice: 20 }, categories: null },
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

/**
 * Variante parametrizable: `sizes` = jugadores por grupo (ej. [3] = un grupo de 3;
 * [2, 0] = uno de 2 + uno vacío). Todos los jugadores quedan asignados a su grupo.
 */
function buildArgsSizes(format: string, sizes: number[]) {
  const tournament = {
    id: 't1', name: 'Test', slug: 'test', course_id: 'c1', status: 'inscripcion', format,
    courses: { slope_rating: 113, course_rating: 72, par_total: 72, nombre: 'Cancha' },
    hole_count: 18,
  } as unknown as Tournament

  const players: Player[] = []
  const groups: TournamentGroup[] = []
  let n = 0
  sizes.forEach((size, gi) => {
    const groupPlayers: TournamentGroup['players'] = []
    for (let i = 0; i < size; i++) {
      n++
      const id = `p${n}`
      players.push({ id, user_id: `u${n}`, handicap_at_registration: 99, status: 'approved', profiles: { name: `J${n}`, indice: 10 }, categories: null } as unknown as Player)
      groupPlayers.push({ id: `gp${n}`, player_id: id, playerName: `J${n}` })
    }
    groups.push({ id: `g${gi + 1}`, name: `Equipo ${gi + 1}`, tee_time: null, sort_order: gi, ronda_libre_id: null, players: groupPlayers })
  })

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

  it('invitado (sin cuenta) en individual: ronda_libre_jugador lleva su nombre y handicap', async () => {
    // Invitado: user_id undefined, sin profiles, nombre + índice tipeados por el
    // organizador. A diferencia del jugador registrado (path byte-idéntico sin
    // handicap), el invitado SÍ lleva su índice a ronda_libre_jugadores para que
    // el leaderboard individual calcule su neto (no tiene profiles.indice).
    const tournament = {
      id: 't1', name: 'Test', slug: 'test', course_id: 'c1', status: 'inscripcion', format: 'stroke_play',
      courses: { slope_rating: 113, course_rating: 72, par_total: 72, nombre: 'Cancha' }, hole_count: 18,
    } as unknown as Tournament
    const players = [
      { id: 'p1', user_id: undefined, player_name: 'Invitado Uno', handicap_at_registration: 15, status: 'approved', profiles: null, categories: null },
    ] as unknown as Player[]
    const groups: TournamentGroup[] = [
      { id: 'g1', name: 'Grupo 1', tee_time: null, sort_order: 0, ronda_libre_id: null,
        players: [{ id: 'gp1', player_id: 'p1', playerName: 'Invitado Uno' }] },
    ]
    const { result } = renderHook(() =>
      useTournamentLifecycle({ tournament, players, groups, setTournamentStatus: vi.fn() }),
    )
    await act(async () => { await result.current.handleStartTournament() })

    const jugadores = recorded.inserts['ronda_libre_jugadores'] as Array<{ nombre: string; user_id: string | null; handicap?: number }>
    expect(jugadores).toHaveLength(1)
    expect(jugadores[0].nombre).toBe('Invitado Uno') // su nombre, no el literal 'Jugador'
    expect(jugadores[0].user_id).toBeNull()
    expect(jugadores[0].handicap).toBe(15) // índice escrito aun en individual → neto correcto
  })

  it('best_ball: crea equipos (handicap_equipo null) + miembros + formato_juego + handicaps por jugador', async () => {
    // best_ball materializa la membresía del equipo igual que scramble/foursome,
    // pero NO almacena handicap de equipo: cada jugador juega con su propio course
    // handicap. El scorer (BestBallTeamCard) y el leaderboard (fetchBestBallTeams)
    // leen los scores individuales y toman la mejor bola neta por hoyo.
    const { result } = renderHook(() => useTournamentLifecycle(buildArgs('best_ball')))
    await act(async () => {
      await result.current.handleStartTournament()
    })

    // La ronda lleva formato_juego para que score-grupo cargue teamEquipos.
    const ronda = recorded.inserts['rondas_libres']?.[0] as { formato_juego?: string }
    expect(ronda?.formato_juego).toBe('best_ball')

    // Un ronda_equipos por grupo, SIN handicap de equipo (cada jugador con el suyo).
    const equipos = recorded.inserts['ronda_equipos'] as Array<{ nombre: string; handicap_equipo: number | null }>
    expect(equipos).toHaveLength(1)
    expect(equipos[0].nombre).toBe('Equipo 1')
    expect(equipos[0].handicap_equipo).toBeNull()

    // Miembros ordenados.
    const miembros = recorded.inserts['ronda_equipo_jugadores'] as Array<{ jugador_id: string; orden: number }>
    expect(miembros).toHaveLength(2)
    expect(miembros.map((m) => m.orden)).toEqual([0, 1])

    // Cada jugador lleva su índice en ronda_libre_jugadores (lo convierte el scorer
    // a course handicap; el leaderboard usa el mismo resolverCourseHandicap).
    const jugadores = recorded.inserts['ronda_libre_jugadores'] as Array<{ handicap?: number }>
    expect(jugadores.map((j) => j.handicap)).toEqual([10, 20])
  })
})

describe('useTournamentLifecycle.handleStartTournament — validación de tamaño de equipo', () => {
  beforeEach(() => {
    recorded.inserts = {}
    pushMock.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  // Bloqueado = no se crea NINGUNA ronda (se corta antes de materializar).
  const fueBloqueado = () =>
    recorded.inserts['rondas_libres'] === undefined && recorded.inserts['ronda_equipos'] === undefined

  it('foursome con 3 jugadores → BLOQUEA el inicio (debe ser exactamente 2)', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('foursome', [3])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(fueBloqueado()).toBe(true)
  })

  it('foursome con exactamente 2 → permite iniciar', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('foursome', [2])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(recorded.inserts['ronda_equipos']).toHaveLength(1)
  })

  it('scramble con 5 jugadores → BLOQUEA (máximo 4)', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('scramble', [5])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(fueBloqueado()).toBe(true)
  })

  it('scramble con 1 jugador → BLOQUEA (mínimo 2)', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('scramble', [1])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(fueBloqueado()).toBe(true)
  })

  it('scramble con 3 jugadores → permite (rango 2-4)', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('scramble', [3])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(recorded.inserts['ronda_equipos']).toHaveLength(1)
  })

  it('best_ball con 4 jugadores → permite (rango 2-4)', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('best_ball', [4])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(recorded.inserts['ronda_equipos']).toHaveLength(1)
  })

  it('un grupo bien (2) y otro mal (3) → BLOQUEA todo el inicio sin efectos colaterales', async () => {
    const args = buildArgsSizes('foursome', [2, 3])
    const { result } = renderHook(() => useTournamentLifecycle(args))
    await act(async () => { await result.current.handleStartTournament() })
    expect(fueBloqueado()).toBe(true)
    // Bloqueo limpio: no se tocó el estado del torneo ni se navegó.
    expect(args.setTournamentStatus).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('grupo vacío (0) se ignora: no bloquea si los demás están bien', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('foursome', [2, 0])))
    await act(async () => { await result.current.handleStartTournament() })
    expect(recorded.inserts['ronda_equipos']).toHaveLength(1)
  })

  it('formato individual (stroke_play) con 3 en un grupo → NO valida tamaño, inicia normal', async () => {
    const { result } = renderHook(() => useTournamentLifecycle(buildArgsSizes('stroke_play', [3])))
    await act(async () => { await result.current.handleStartTournament() })
    // Individual: crea ronda pero NO ronda_equipos, y nunca bloquea por tamaño.
    expect(recorded.inserts['rondas_libres']).toHaveLength(1)
    expect(recorded.inserts['ronda_equipos']).toBeUndefined()
  })
})
