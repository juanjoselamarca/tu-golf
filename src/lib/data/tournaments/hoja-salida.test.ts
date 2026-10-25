import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarHojaSalida, lineaCanchaHojaSalida, textoHojaSalida, type TorneoHojaSalida } from './hoja-salida'

const base: TorneoHojaSalida = { name: 'Copa', course_name: 'Prince of Wales', date_start: null, tees: 'azul', hole_count: 9 }

describe('lineaCanchaHojaSalida', () => {
  it('cancha · hoyos · tees', () => {
    expect(lineaCanchaHojaSalida(base)).toBe('Prince of Wales · 9H · Tees Azul')
  })

  it('sin cancha no empieza con un "·" suelto (regresión: "· 9H · Tees Azul")', () => {
    expect(lineaCanchaHojaSalida({ ...base, course_name: null })).toBe('9H · Tees Azul')
    expect(lineaCanchaHojaSalida({ ...base, course_name: '  ' })).toBe('9H · Tees Azul')
  })

  it('traduce los tees especiales', () => {
    expect(lineaCanchaHojaSalida({ ...base, tees: 'per_player' })).toBe('Prince of Wales · 9H · Tees por jugador')
  })
})

describe('textoHojaSalida', () => {
  it('el texto compartido tampoco arrastra el "·" suelto', () => {
    const texto = textoHojaSalida({ ...base, course_name: null }, [{ name: 'Grupo 1', tee_time: null, players: [{ name: 'Ana', handicap: 12.4 }] }], 'golfers.cl')
    expect(texto.split('\n')).toEqual(['COPA', '9H · Tees Azul', '', 'Grupo 1', '  Ana (12.4)', '', 'Golfers+ · golfers.cl'])
  })
})

/** Mock mínimo del query builder de supabase-js: cada tabla devuelve su `data`. */
function mockSupabase(tablas: Record<string, unknown>): SupabaseClient {
  const builder = (data: unknown) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.single = () => Promise.resolve({ data, error: null })
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res)
    return q
  }
  return { from: (t: string) => builder(tablas[t]) } as unknown as SupabaseClient
}

describe('cargarHojaSalida', () => {
  it('toma el nombre de la cancha del catálogo cuando tournaments.course_name es NULL', async () => {
    const hoja = await cargarHojaSalida(mockSupabase({
      tournaments: { id: 't1', name: 'a', course_name: null, date_start: '2026-05-12', tees: 'azul', hole_count: 9, courses: { nombre: 'Prince of Wales' } },
      tournament_groups: [{ name: 'Grupo 1', tee_time: null, tournament_group_players: [{ player_id: 'p', players: { profiles: { name: 'Ana', indice: 5 } } }] }],
    }), 'a')
    expect(hoja?.tournament.course_name).toBe('Prince of Wales')
    expect(hoja?.groups).toEqual([{ name: 'Grupo 1', tee_time: null, players: [{ name: 'Ana', handicap: 5 }] }])
  })

  it('torneo inexistente → null', async () => {
    expect(await cargarHojaSalida(mockSupabase({ tournaments: null }), 'x')).toBeNull()
  })

  it('sin grupos → todos los aprobados', async () => {
    const hoja = await cargarHojaSalida(mockSupabase({
      tournaments: { id: 't1', name: 'a', course_name: 'Club', date_start: null, tees: 'azul', hole_count: 18, courses: null },
      tournament_groups: [],
      players: [{ profiles: { name: null, indice: null } }],
    }), 'a')
    expect(hoja?.tournament.course_name).toBe('Club')
    expect(hoja?.groups).toEqual([{ name: 'Todos los jugadores', tee_time: null, players: [{ name: 'Jugador', handicap: null }] }])
  })
})
