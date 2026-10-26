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

  it('el índice sale con un decimal, igual que en pantalla ("12.0", no "12")', () => {
    const texto = textoHojaSalida(base, [{ name: 'G', tee_time: null, players: [{ name: 'Ana', handicap: 12 }, { name: 'Bea', handicap: -1.2 }] }], 'golfers.cl')
    expect(texto).toContain('  Ana (12.0)')
    expect(texto).toContain('  Bea (-1.2)')
  })
})

/**
 * Mock mínimo del query builder de supabase-js: cada tabla devuelve su `data`;
 * las tablas en `errores` devuelven `{ data: null, error }` (supabase-js no lanza).
 */
function mockSupabase(tablas: Record<string, unknown>, errores: Record<string, { code: string; message: string }> = {}): SupabaseClient {
  const builder = (t: string) => {
    const r = errores[t] ? { data: null, error: errores[t] } : { data: tablas[t], error: null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.single = () => Promise.resolve(r)
    q.then = (res: (v: unknown) => unknown) => Promise.resolve(r).then(res)
    return q
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient
}

const torneoOk = { id: 't1', name: 'a', course_name: 'Club', date_start: null, tees: 'azul', hole_count: 18, courses: null }

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

  it('cancha de 27 hoyos: muestra el recorrido además del club', async () => {
    const hoja = await cargarHojaSalida(mockSupabase({
      tournaments: { ...torneoOk, course_name: null, courses: { nombre: 'Club X', loop_nombre: 'Norte' } },
      tournament_groups: [],
      players: [],
    }), 'a')
    expect(hoja?.tournament.course_name).toBe('Club X — Norte')
  })

  // Regresión (revisión 26-oct): supabase-js no lanza, devuelve `error`. Antes un error se leía como
  // "torneo no encontrado" o "sin grupos" y el organizador compartía una hoja vacía o equivocada.
  it('error al leer el torneo → lanza (no es "no encontrado")', async () => {
    await expect(cargarHojaSalida(mockSupabase({}, { tournaments: { code: '08006', message: 'red' } }), 'a')).rejects.toMatchObject({ code: '08006' })
  })

  it('error al leer los grupos → lanza (no cae a "Todos los jugadores")', async () => {
    await expect(cargarHojaSalida(
      mockSupabase({ tournaments: torneoOk, players: [{ profiles: { name: 'Ana', indice: 1 } }] }, { tournament_groups: { code: '57014', message: 'timeout' } }),
      'a',
    )).rejects.toMatchObject({ code: '57014' })
  })

  it('error al leer los jugadores → lanza (no "No hay grupos armados")', async () => {
    await expect(cargarHojaSalida(
      mockSupabase({ tournaments: torneoOk, tournament_groups: [] }, { players: { code: '42501', message: 'rls' } }),
      'a',
    )).rejects.toMatchObject({ code: '42501' })
  })

  it('PGRST116 (single sin filas) sigue siendo "no existe" → null', async () => {
    expect(await cargarHojaSalida(mockSupabase({}, { tournaments: { code: 'PGRST116', message: '0 rows' } }), 'x')).toBeNull()
  })
})
