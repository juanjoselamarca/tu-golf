/**
 * GWI de ronda libre en Stableford GROSS — revisión Fable del hotfix Los Leones (04-oct-2026).
 *
 * La ruta pasaba `courseHcpMap[j.id]` al marcador del GWI aunque la ronda fuera gross: el panel
 * "probabilidad de ganar" rankeaba con puntos NETOS mientras la tabla mostraba gross.
 * Este test llama a la RUTA real (no reimplementa su cadena) y mira qué handicap le entrega
 * al motor del GWI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HOYOS_LEONES, TARJETAS_LEONES } from '@/golf/core/__fixtures__/los-leones'

const ronda = {
  id: 'r1', course_name: 'Club de Golf Los Leones', course_id: 'c1', tees: 'azul', holes: 18, hoyo_inicio: 1,
  modo_juego: 'gross', formato_juego: 'stableford', creador_id: 'u1', admin_user_id: 'u1', recorridos: null,
  ronda_libre_jugadores: [
    { id: 'A', nombre: 'QA_LEONES_A', user_id: null, scores: TARJETAS_LEONES.A, handicap: 18, tees: 'azul' },
    { id: 'D', nombre: 'QA_LEONES_D', user_id: null, scores: TARJETAS_LEONES.D, handicap: null, tees: 'azul' },
  ],
}

/** Cadena PostgREST mínima: cualquier método encadena; `single` y el await resuelven. */
function query(data: unknown) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) q[m] = () => q
  q.single = async () => ({ data, error: null })
  q.maybeSingle = async () => ({ data, error: null })
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: Array.isArray(data) ? data : [], error: null }).then(res)
  return q
}

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => query(t === 'rondas_libres' ? ronda : []),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))
vi.mock('@/lib/data/course-holes', () => ({ fetchHoyosDeLaRonda: async () => HOYOS_LEONES }))
vi.mock('@/lib/data/ronda-libre', () => ({
  courseHandicapsDeRonda: async () => ({ courseHcpMap: { A: 23, D: 0 }, indexByJugador: { A: 18, D: 0 } }),
}))
const llamadas: Array<{ courseHcp: number }> = []
vi.mock('@/golf/stats/gwi', async (orig) => {
  const real = await orig<typeof import('@/golf/stats/gwi')>()
  return {
    ...real,
    marcadorEnCursoGWI: (input: Parameters<typeof real.marcadorEnCursoGWI>[0]) => {
      llamadas.push({ courseHcp: input.courseHcp })
      return real.marcadorEnCursoGWI(input)
    },
  }
})

import { GET } from '@/app/api/gwi/ronda-libre/[codigo]/route'

describe('GET /api/gwi/ronda-libre — Stableford gross', () => {
  beforeEach(() => { llamadas.length = 0 })

  it('el motor del GWI recibe handicap 0 en gross (A con CH 23 no recibe golpes)', async () => {
    await GET(new Request('http://x/api/gwi/ronda-libre/QA'), { params: Promise.resolve({ codigo: 'QA' }) })
    expect(llamadas.length).toBe(2)
    expect(llamadas.map(l => l.courseHcp)).toEqual([0, 0])
  })

  it('en neto el motor sigue recibiendo el course handicap', async () => {
    ronda.modo_juego = 'neto'
    try {
      await GET(new Request('http://x/api/gwi/ronda-libre/QA'), { params: Promise.resolve({ codigo: 'QA' }) })
      expect(llamadas.map(l => l.courseHcp)).toEqual([23, 0])
    } finally {
      ronda.modo_juego = 'gross'
    }
  })
})
