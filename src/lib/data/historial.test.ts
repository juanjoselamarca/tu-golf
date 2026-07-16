/**
 * Capa de datos de /perfil/historial.
 *
 * Pines críticos:
 *  - fetchHistorialRounds: columnas de SELECT_COLUMNS, error → loadError (no throw).
 *  - fetchHistorialStats: paginación de course_holes ORDENADA por
 *    (course_id, numero) — clave única, fix #254 — y loop hasta página corta.
 */
import { describe, it, expect, vi } from 'vitest'
import { fetchHistorialRounds, fetchHistorialStats, SELECT_COLUMNS } from './historial'

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(async () => {}),
}))

function mockSupabase(handlers: unknown) {
  return handlers as never
}

describe('SELECT_COLUMNS', () => {
  it('incluye formato_juego y modo_juego (badges del historial) y par_per_hole', () => {
    for (const col of ['formato_juego', 'modo_juego', 'par_per_hole', 'excluded_from_handicap', 'diferencial']) {
      expect(SELECT_COLUMNS).toContain(col)
    }
  })
})

describe('fetchHistorialRounds', () => {
  it('devuelve rondas con loadError=false en el camino feliz', async () => {
    const supabase = {
      from: () => ({
        select: (cols: string) => {
          expect(cols).toBe(SELECT_COLUMNS)
          return {
            eq: (col: string, val: string) => {
              expect(col).toBe('user_id')
              expect(val).toBe('u1')
              return {
                order: () => ({
                  limit: async () => ({ data: [{ id: 'r1', course_name: 'X' }], error: null }),
                }),
              }
            },
          }
        },
      }),
    }
    const res = await fetchHistorialRounds(mockSupabase(supabase), 'u1')
    expect(res.loadError).toBe(false)
    expect(res.rounds).toHaveLength(1)
  })

  it('error de query → rounds vacío + loadError=true (la UI pinta retry, no rompe)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    }
    const res = await fetchHistorialRounds(mockSupabase(supabase), 'u1')
    expect(res).toEqual({ rounds: [], loadError: true })
  })
})

describe('fetchHistorialStats', () => {
  /** Mock: rondas + courses ok; course_holes con paginación configurable. */
  function buildSupabase(opts: {
    holePages: Array<Array<{ course_id: string; numero: number; par: number }>>
    roundsError?: boolean
  }) {
    const holeOrderCalls: string[][] = []
    const holeRangeCalls: Array<[number, number]> = []
    let pageIdx = 0

    const supabase = {
      from: (table: string) => {
        if (table === 'historical_rounds') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => opts.roundsError
                  ? { data: null, error: { message: 'boom' } }
                  : {
                      data: [{
                        id: 'r1', course_name: 'Club A', course_id: 'cA',
                        played_at: '2026-05-01', scores: [3, 4, 5], total_gross: 12,
                        holes_played: 3, import_source: null,
                      }],
                      error: null,
                    },
              }),
            }),
          }
        }
        if (table === 'courses') {
          return {
            select: async () => ({ data: [{ id: 'cA', nombre: 'Club A' }], error: null }),
          }
        }
        // course_holes — registra orden y rangos para pinear el fix #254
        const orders: string[] = []
        const chain = {
          select: () => chain,
          order: (col: string) => { orders.push(col); return chain },
          range: async (from: number, to: number) => {
            holeOrderCalls.push([...orders])
            holeRangeCalls.push([from, to])
            const data = opts.holePages[pageIdx] ?? []
            pageIdx++
            return { data, error: null }
          },
        }
        return chain
      },
    }
    return { supabase, holeOrderCalls, holeRangeCalls }
  }

  it('pagina course_holes ordenando por (course_id, numero) — clave única, fix #254', async () => {
    // Página llena (1000) → pide la siguiente; corta → termina.
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      course_id: 'cZ', numero: (i % 18) + 1, par: 4,
    }))
    const lastPage = [
      { course_id: 'cA', numero: 1, par: 4 },
      { course_id: 'cA', numero: 2, par: 4 },
      { course_id: 'cA', numero: 3, par: 5 },
    ]
    const { supabase, holeOrderCalls, holeRangeCalls } = buildSupabase({ holePages: [fullPage, lastPage] })

    const stats = await fetchHistorialStats(mockSupabase(supabase), 'u1')

    expect(holeRangeCalls).toEqual([[0, 999], [1000, 1999]])
    for (const orders of holeOrderCalls) {
      expect(orders).toEqual(['course_id', 'numero']) // determinista — NO solo numero
    }
    // La ronda 3,4,5 contra pares 4,4,5: birdie + par + par
    expect(stats).not.toBeNull()
    expect(stats!.totalBirdies).toBe(1)
    expect(stats!.totalPars).toBe(2)
  })

  it('error en rondas → null (el route responde 500, la página cae al cálculo local)', async () => {
    const { supabase } = buildSupabase({ holePages: [[]], roundsError: true })
    const stats = await fetchHistorialStats(mockSupabase(supabase), 'u1')
    expect(stats).toBeNull()
  })
})
