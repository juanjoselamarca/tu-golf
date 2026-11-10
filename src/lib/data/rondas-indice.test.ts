// Las rondas que promedia el Índice Golfers+, leídas con el MISMO predicado que el RPC
// `calcular_indice_golfers`. Antes había dos lectores: Mi Golf contaba "diferencial no nulo" (una ronda
// excluida o con gross imposible sumaba en la barra y no en el índice) y el CPI filtraba FedeGolf aparte
// y se tragaba el error.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { fetchRondasIndice } from './rondas-indice'

type Res = { data: unknown; error: unknown }

function supabase(res: Res) {
  const llamadas: string[] = []
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'or', 'order', 'limit']) b[m] = (...a: unknown[]) => { llamadas.push(`${m}:${JSON.stringify(a)}`); return b }
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko)
  return { client: { from: () => b } as never, llamadas }
}

function ronda(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, played_at: `2026-10-${id.padStart(2, '0')}`, created_at: null, diferencial: 12, slope_rating: 125,
    course_rating: 71, excluded_from_handicap: false, total_gross: 85, holes_played: 18, ...extra,
  }
}

beforeEach(() => captureError.mockClear())

describe('fetchRondasIndice', () => {
  it('no cuenta la excluida, la de gross < 3 por hoyo ni la sin slope, aunque traigan diferencial', async () => {
    const s = supabase({
      data: [
        ronda('1'),
        ronda('2', { excluded_from_handicap: true }),
        ronda('3', { total_gross: 50 }), // 50 < 3 × 18
        ronda('4', { holes_played: 9, total_gross: 40 }), // 9 hoyos con gross posible: cuenta
        ronda('5', { slope_rating: null }),
      ],
      error: null,
    })
    expect((await fetchRondasIndice(s.client, 'u1'))?.map(r => r.id)).toEqual(['4', '1'])
  })

  it('no filtra FedeGolf aparte (el RPC tampoco: llegan excluidas), sin limit, con el orden del RPC', async () => {
    const s = supabase({ data: [], error: null })
    await fetchRondasIndice(s.client, 'u1')
    expect(s.llamadas.some(l => l.startsWith('or:'))).toBe(false)
    expect(s.llamadas.some(l => l.startsWith('limit:'))).toBe(false)
    expect(s.llamadas).toContain('eq:["user_id","u1"]')
    expect(s.llamadas).toContain('eq:["excluded_from_handicap",false]')
    expect(s.llamadas.filter(l => l.startsWith('order:')).map(l => JSON.parse(l.slice(6))[0])).toEqual(['played_at', 'created_at', 'id'])
  })

  it('tope en la ventana del índice (20)', async () => {
    const s = supabase({ data: Array.from({ length: 25 }, (_, i) => ronda(String(i + 1))), error: null })
    expect(await fetchRondasIndice(s.client, 'u1')).toHaveLength(20)
  })

  it('si la base responde error, null y se reporta (no se traga)', async () => {
    const error = { code: '500', message: 'boom' }
    expect(await fetchRondasIndice(supabase({ data: null, error }).client, 'u1')).toBeNull()
    expect(captureError).toHaveBeenCalledWith(error, expect.objectContaining({ context: 'historical-rounds.rondas-indice' }))
  })
})
