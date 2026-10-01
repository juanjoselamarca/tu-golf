import { describe, it, expect, vi } from 'vitest'
import {
  COLUMNAS_RONDA_SCORER,
  fetchRondaLibreParaScorer,
  hoyosPorDefecto,
  cargarHoyosDelScorer,
  resolverHandicapsDelScorer,
  fetchEquiposDelScorer,
  tarjetasDesdeLaRonda,
} from './ronda-libre-scorer'

vi.mock('@/golf/core/course-handicap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/golf/core/course-handicap')>()
  return {
    ...real,
    cargarCourseData: vi.fn(async (_c: unknown, tee: string) => ({ tee })),
    resolverCourseHandicap: vi.fn((index: number) => Math.round(index)),
    resolverHandicapDisplayDeRonda: vi.fn(async (index: number) => Math.round(index) + 100),
  }
})

type Cadena = Array<[string, unknown[]]>

function fakeSupabase(porTabla: Record<string, { data?: unknown; error?: unknown } | ((cadena: Cadena) => { data?: unknown; error?: unknown })>) {
  const llamadas: Array<{ tabla: string; cadena: Cadena }> = []
  return {
    llamadas,
    from(tabla: string) {
      const cadena: Cadena = []
      llamadas.push({ tabla, cadena })
      const resolver = () => {
        const r = porTabla[tabla]
        return { data: null, error: null, ...(typeof r === 'function' ? r(cadena) : (r ?? {})) }
      }
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(res, rej)
          return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
        },
      })
      return proxy
    },
  }
}

/** Cancha de 9 hoyos: par 36, SI 1..9, yardajes verificados. */
const CATALOGO_9 = Array.from({ length: 9 }, (_, i) => ({
  numero: i + 1, par: i === 2 ? 3 : i === 3 ? 5 : 4, stroke_index: i + 1, recorrido: null,
  yardaje_negras: 400 + i, yardaje_azul: 380 + i, yardaje_blanco: 360 + i, yardaje_rojo: 300 + i, yardaje_verificado_at: '2026-01-01',
}))

describe('fetchRondaLibreParaScorer', () => {
  it('pide las columnas canónicas (incluye es_demo, que al scorer individual le faltaba)', async () => {
    const sb = fakeSupabase({ rondas_libres: { data: { id: 'r1', codigo: 'ABC' } } })
    const r = await fetchRondaLibreParaScorer(sb as never, 'ABC')
    expect(r?.id).toBe('r1')
    expect(sb.llamadas[0].cadena[0]).toEqual(['select', [COLUMNAS_RONDA_SCORER]])
    expect(COLUMNAS_RONDA_SCORER).toContain('es_demo')
    expect(COLUMNAS_RONDA_SCORER).toContain('ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
  })
  it('null si no existe', async () => {
    expect(await fetchRondaLibreParaScorer(fakeSupabase({ rondas_libres: { data: null } }) as never, 'X')).toBeNull()
  })
})

describe('cargarHoyosDelScorer', () => {
  it('sin cancha: par 4, SI = número, sin yardaje, par estándar', async () => {
    const sb = fakeSupabase({})
    const r = await cargarHoyosDelScorer(sb as never, { course_id: null, recorridos: null, holes: 9, tees: 'azul' })
    expect(r).toEqual(hoyosPorDefecto(9))
    expect(r.finalParTotal).toBe(36)
    expect(r.holeDataMap[5]).toEqual({ numero: 5, par: 4, stroke_index: 5, yardaje: null })
    expect(sb.llamadas).toHaveLength(0)
  })

  it('cancha sin course_holes: defaults', async () => {
    const sb = fakeSupabase({ course_holes: { data: [] } })
    const r = await cargarHoyosDelScorer(sb as never, { course_id: 'c1', recorridos: null, holes: 18, tees: 'azul' })
    expect(r.finalParTotal).toBe(72)
    expect(Object.keys(r.parMap)).toHaveLength(18)
  })

  it('cancha de 9 jugada a 18: los hoyos 10-18 son los 1-9 otra vez, con yardaje del tee de la ronda', async () => {
    const sb = fakeSupabase({ course_holes: { data: CATALOGO_9 } })
    const r = await cargarHoyosDelScorer(sb as never, { course_id: 'c1', recorridos: null, holes: 18, tees: 'blanco' })
    expect(Object.keys(r.parMap)).toHaveLength(18)
    expect(r.finalParTotal).toBe(72)
    expect(r.parMap[3]).toBe(3)
    expect(r.parMap[12]).toBe(3) // segunda vuelta del hoyo 3
    expect(r.holeDataMap[12].yardaje).toBe(362) // yardaje_blanco del hoyo 3 (origen)
    expect(r.holeDataMap[12].yardajes).toEqual({ negras: 402, azul: 382, blanco: 362, rojo: 302 })
    // SI de la segunda vuelta: pares (regla de dos vueltas)
    expect(r.holeDataMap[1].stroke_index).toBe(1)
    expect(r.holeDataMap[10].stroke_index).toBe(2)
  })

  it('yardajes sin verificar no se exponen', async () => {
    const sinVerificar = CATALOGO_9.map(h => ({ ...h, yardaje_verificado_at: null }))
    const sb = fakeSupabase({ course_holes: { data: sinVerificar } })
    const r = await cargarHoyosDelScorer(sb as never, { course_id: 'c1', recorridos: null, holes: 9, tees: 'azul' })
    expect(r.holeDataMap[1].yardaje).toBeNull()
    expect(r.holeDataMap[1].yardajes).toBeUndefined()
  })
})

describe('resolverHandicapsDelScorer', () => {
  const ronda = { course_id: 'c1', recorridos: null, holes: 18, tees: 'azul' }
  it('índice de la ronda > perfil > 0 para invitado; tee por jugador en minúsculas', async () => {
    const sb = fakeSupabase({ profiles: { data: { indice: 14.6 } } })
    const { hcpMap, displayMap } = await resolverHandicapsDelScorer(sb as never, {
      ...ronda,
      ronda_libre_jugadores: [
        { id: 'a', nombre: 'A', user_id: 'u1', scores: {}, handicap: 11.1, tees: 'Blanco' },
        { id: 'b', nombre: 'B', user_id: 'u2', scores: {}, handicap: null, tees: null },
        { id: 'c', nombre: 'C', user_id: null, scores: {}, handicap: null, tees: null },
      ],
    }, 72)
    expect(hcpMap).toEqual({ a: 11, b: 15, c: 0 })
    expect(displayMap).toEqual({ a: 111, b: 115, c: 100 })
    // Sólo B consulta el perfil (A trae índice, C es invitado).
    expect(sb.llamadas.filter(l => l.tabla === 'profiles')).toHaveLength(1)
    const { cargarCourseData } = await import('@/golf/core/course-handicap')
    const tees = (cargarCourseData as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => c[1])
    expect(new Set(tees)).toEqual(new Set(['blanco', 'azul']))
  })
})

describe('fetchEquiposDelScorer', () => {
  const jugadores = [
    { id: 'p1', nombre: 'Ana', user_id: null, scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ]
  it('formato individual: [] sin consultar', async () => {
    const sb = fakeSupabase({})
    expect(await fetchEquiposDelScorer(sb as never, { id: 'r1', formato_juego: 'stroke_play', ronda_libre_jugadores: jugadores })).toEqual([])
    expect(sb.llamadas).toHaveLength(0)
  })
  it('scramble: equipos por la fuente única con los nombres de los miembros en orden', async () => {
    const sb = fakeSupabase({
      ronda_equipos: { data: [{ id: 'e1', nombre: 'Cóndores', handicap_equipo: 8, scores: { '1': 4 }, ronda_equipo_jugadores: [{ jugador_id: 'p2', orden: 2 }, { jugador_id: 'p1', orden: 1 }, { jugador_id: 'zz', orden: 3 }] }] },
    })
    const eq = await fetchEquiposDelScorer(sb as never, { id: 'r1', formato_juego: 'scramble', ronda_libre_jugadores: jugadores })
    expect(eq).toEqual([{ id: 'e1', nombre: 'Cóndores', handicap_equipo: 8, scores: { '1': 4 }, jugadorIds: ['p1', 'p2', 'zz'], jugadorNombres: ['Ana', 'Beto', '?'] }])
  })
})

describe('tarjetasDesdeLaRonda', () => {
  it('claves JSONB string → número, por jugador', () => {
    expect(tarjetasDesdeLaRonda({ ronda_libre_jugadores: [
      { id: 'p1', nombre: 'A', user_id: null, scores: { '10': 4, '11': 5 } },
      { id: 'p2', nombre: 'B', user_id: null, scores: null as never },
    ] })).toEqual({ p1: { 10: 4, 11: 5 }, p2: {} })
  })
})
