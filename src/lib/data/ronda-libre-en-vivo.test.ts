import { describe, it, expect, vi } from 'vitest'
import { parYSiDeLaRonda, cargarRondaLibreEnVivo } from './ronda-libre'
import { leerIndicesDelCliente } from './indices-de-perfil-lectura'

vi.mock('@/golf/core/course-handicap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/golf/core/course-handicap')>()
  return {
    ...real,
    resolverCourseData: vi.fn(async () => null),
    resolverCourseHandicap: vi.fn((index: number) => Math.round(index)),
    resolverHandicapDisplayDeRonda: vi.fn(async (index: number) => Math.round(index) + 100),
  }
})

const CANCHA_9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: i === 2 ? 3 : i === 3 ? 5 : 4, stroke_index: i + 1 }))

describe('parYSiDeLaRonda (pura)', () => {
  it('sin catálogo: mapas vacíos y par estándar', () => {
    expect(parYSiDeLaRonda([], 18)).toEqual({ parMap: {}, siMap: {}, parTotal: 72 })
    expect(parYSiDeLaRonda([], 9)).toEqual({ parMap: {}, siMap: {}, parTotal: 36 })
  })

  it('cancha de 9 en ronda de 18: dos vueltas (hoyo 12 = hoyo 3), par 72', () => {
    const r = parYSiDeLaRonda(CANCHA_9, 18)
    expect(Object.keys(r.parMap)).toHaveLength(18)
    expect(r.parMap[12]).toBe(3)
    expect(r.parMap[13]).toBe(5)
    expect(r.parTotal).toBe(72)
    // SI permutación 1..18
    expect(Object.values(r.siMap).sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  // QA Timba 17-nov (ronda 251825): una ronda de 9 desde el 10 en una cancha de 18 rankeaba el SI sobre 1..9 —
  // hoyos que no se juegan— y el siMap salía sin 10..18. La Timba neto no calculaba ("faltan datos de la cancha") y
  // el leaderboard repartía los golpes por número de hoyo (10, 11, 12…) en vez de por dificultad.
  const CANCHA_18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: [7, 6, 1, 9, 4, 2, 8, 3, 5, 10, 18, 12, 14, 16, 11, 13, 15, 17][i] }))
  it('9 hoyos desde el 10: SI de los hoyos 10..18 (los que se juegan), permutación 1..9 en su orden de dificultad', () => {
    const r = parYSiDeLaRonda(CANCHA_18, 9, 10)
    expect(Object.keys(r.siMap).map(Number).sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    // SI de catálogo 10,18,12,14,16,11,13,15,17 → rango 1,9,3,5,7,2,4,6,8
    expect([10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => r.siMap[h])).toEqual([1, 9, 3, 5, 7, 2, 4, 6, 8])
  })
  it('9 hoyos con salida en el 14: hoyos 14..18 y 1..4', () => {
    const r = parYSiDeLaRonda(CANCHA_18, 9, 14)
    expect(Object.keys(r.siMap).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 14, 15, 16, 17, 18])
    expect(Object.values(r.siMap).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('9 hoyos desde el 1 y 18 desde el 10: igual que antes', () => {
    expect(parYSiDeLaRonda(CANCHA_18, 9, 1).siMap).toEqual(parYSiDeLaRonda(CANCHA_18, 9).siMap)
    expect(parYSiDeLaRonda(CANCHA_18, 18, 10).siMap).toEqual(parYSiDeLaRonda(CANCHA_18, 18).siMap)
  })
  it('cancha de 9 jugada 9 hoyos con salida en el 5: SI de sus 9 hoyos', () => {
    expect(parYSiDeLaRonda(CANCHA_9, 9, 5).siMap).toEqual(parYSiDeLaRonda(CANCHA_9, 9).siMap)
  })

  it('SI corrupto (duplicados) sale normalizado a permutación válida', () => {
    const corrupto = CANCHA_9.map(h => ({ ...h, stroke_index: 1 }))
    const r = parYSiDeLaRonda(corrupto, 9)
    expect(Object.values(r.siMap).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(r.parTotal).toBe(36)
  })
})

/** Supabase falso: cada `from(tabla)` resuelve con lo dado, sea cual sea la cadena. */
function fakeSupabase(tablas: Record<string, { data: unknown; error?: unknown }>) {
  const consultas: string[] = []
  const builder = (res: { data: unknown; error: unknown }): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, k) {
        if (k === 'then') return (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko)
        if (k === 'single' || k === 'maybeSingle') return async () => res
        return () => b
      },
    })
    return b
  }
  return {
    consultas,
    from(tabla: string) {
      consultas.push(tabla)
      const t = tablas[tabla]
      return builder({ data: t?.data ?? null, error: t?.error ?? null })
    },
  }
}

const RONDA = {
  id: 'r1', codigo: 'ABC123', course_name: 'Los Leones', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-08', estado: 'en_curso', modo_juego: 'neto', formato_juego: 'stroke_play', admin_mode: false,
  admin_user_id: null, creador_id: 'u1', recorridos: null,
  ronda_libre_jugadores: [
    { id: 'j1', nombre: 'Ana', user_id: 'u1', scores: { 1: 4 }, handicap: null, tees: null },
    { id: 'j2', nombre: 'Bea', user_id: null, scores: { 1: 5 }, handicap: 12.4, tees: null },
    { id: 'j3', nombre: 'Caro', user_id: null, scores: {}, handicap: null, tees: null },
  ],
}

describe('cargarRondaLibreEnVivo', () => {
  it('el índice del perfil se lee SÓLO con el lector inyectado; las tablas públicas con el cliente anónimo', async () => {
    const anon = fakeSupabase({ rondas_libres: { data: RONDA } })
    const indices = fakeSupabase({ profiles: { data: [{ id: 'u1', indice: 9.6 }] } })
    const r = await cargarRondaLibreEnVivo(anon as never, 'ABC123', leerIndicesDelCliente(indices as never))
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(anon.consultas).not.toContain('profiles')
    expect(indices.consultas).toEqual(['profiles'])
    expect(r.courseHcpMap).toEqual({ j1: 10, j2: 12, j3: 0 })
    expect(r.displayHcpMap).toEqual({ j1: 110, j2: 112, j3: 100 })
    expect(r.sinIndice).toEqual(['j3'])
    expect(r.equipos).toEqual([])
    expect(r.parMap).toEqual({})
  })

  it('código inexistente → not_found; error de la base → transient', async () => {
    const vacio = fakeSupabase({ rondas_libres: { data: null, error: { code: 'PGRST116' } } })
    expect((await cargarRondaLibreEnVivo(vacio as never, 'NOPE', null)).status).toBe('not_found')
    const caido = fakeSupabase({ rondas_libres: { data: null, error: { code: '57014', message: 'statement timeout' } } })
    expect((await cargarRondaLibreEnVivo(caido as never, 'ABC123', null)).status).toBe('transient')
  })

  // #511 — con el error tragado, el jugador quedaba con índice 0 y el neto salía
  // como gross. Discrimina: el código anterior devolvía 'ok' con índice 0.
  it('error al leer perfiles → la carga falla cerrada (error), nunca un índice 0 tragado', async () => {
    const anon = fakeSupabase({ rondas_libres: { data: RONDA } })
    const caido = fakeSupabase({ profiles: { data: null, error: { code: '57014', message: 'statement timeout' } } })
    const r = await cargarRondaLibreEnVivo(anon as never, 'ABC123', leerIndicesDelCliente(caido as never))
    expect(r.status).toBe('error')
  })
})
