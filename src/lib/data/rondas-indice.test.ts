// Mi Golf ("Calibración del índice" / "Sin calibrar") cuenta las rondas con el MISMO predicado que el RPC
// `calcular_indice_golfers`: antes contaba "diferencial no nulo", y una ronda excluida o con gross imposible
// sumaba en la barra pero no en el índice.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { loadRondasValidasIndice } from './dashboard'

type Res = { data: unknown; error: unknown }

function supabase(res: Res) {
  const llamadas: string[] = []
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'or']) b[m] = (...a: unknown[]) => { llamadas.push(`${m}:${JSON.stringify(a)}`); return b }
  let ordenes = 0
  b.order = (...a: unknown[]) => { llamadas.push(`order:${JSON.stringify(a)}`); return ++ordenes === 3 ? Promise.resolve(res) : b }
  return { client: { from: () => b } as never, llamadas }
}

function ronda(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, played_at: `2026-10-${id.padStart(2, '0')}`, created_at: null, diferencial: 12, slope_rating: 125,
    course_rating: 71, excluded_from_handicap: false, total_gross: 85, holes_played: 18, ...extra,
  }
}

beforeEach(() => captureError.mockClear())

describe('loadRondasValidasIndice', () => {
  it('no cuenta la excluida ni la de gross < 3 por hoyo, aunque traigan diferencial', async () => {
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
    expect(await loadRondasValidasIndice(s.client, 'u1')).toBe(2)
  })

  it('no filtra FedeGolf aparte (el RPC tampoco: llegan excluidas) y achica el query con el predicado', async () => {
    const s = supabase({ data: [], error: null })
    await loadRondasValidasIndice(s.client, 'u1')
    expect(s.llamadas.some(l => l.startsWith('or:'))).toBe(false)
    expect(s.llamadas).toContain('eq:["user_id","u1"]')
    expect(s.llamadas).toContain('eq:["excluded_from_handicap",false]')
  })

  it('tope en la ventana del índice (20)', async () => {
    const s = supabase({ data: Array.from({ length: 25 }, (_, i) => ronda(String(i + 1))), error: null })
    expect(await loadRondasValidasIndice(s.client, 'u1')).toBe(20)
  })

  it('si la base responde error, null (sin barra inventada) y se reporta', async () => {
    const error = { code: '500', message: 'boom' }
    expect(await loadRondasValidasIndice(supabase({ data: null, error }).client, 'u1')).toBeNull()
    expect(captureError).toHaveBeenCalledWith(error, expect.objectContaining({ context: 'mi-golf.rondas-validas-indice' }))
  })
})
