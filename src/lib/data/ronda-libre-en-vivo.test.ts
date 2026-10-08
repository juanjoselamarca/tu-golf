import { describe, it, expect, vi } from 'vitest'
import { parYSiDeLaRonda, cargarRondaLibreEnVivo } from './ronda-libre'

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
  it('el índice del perfil se lee SÓLO con clienteIndices; las tablas públicas con el cliente anónimo', async () => {
    const anon = fakeSupabase({ rondas_libres: { data: RONDA } })
    const indices = fakeSupabase({ profiles: { data: [{ id: 'u1', indice: 9.6 }] } })
    const r = await cargarRondaLibreEnVivo(anon as never, 'ABC123', indices as never)
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
    expect((await cargarRondaLibreEnVivo(vacio as never, 'NOPE')).status).toBe('not_found')
    const caido = fakeSupabase({ rondas_libres: { data: null, error: { code: '57014', message: 'statement timeout' } } })
    expect((await cargarRondaLibreEnVivo(caido as never, 'ABC123')).status).toBe('transient')
  })
})
