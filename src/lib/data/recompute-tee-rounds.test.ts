import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyDefaultTeeToRounds } from './recompute-tee-rounds'
import { calcularDiferencial } from '@/lib/indice-golfers'

/**
 * Stub de supabase: el query de rondas y el de tees resuelven sus datos; los
 * .update() se capturan en `updates`. Evita tocar prod (mutaría rondas reales).
 */
function stub(roundsData: unknown[], teesData: unknown[], updates: Record<string, unknown>[]): SupabaseClient {
  return {
    from(table: string) {
      let updatePayload: Record<string, unknown> | null = null
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        is: () => b,
        not: () => b,
        update: (p: Record<string, unknown>) => {
          updatePayload = p
          return b
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (updatePayload) {
            updates.push(updatePayload)
            return Promise.resolve({ error: null }).then(resolve)
          }
          if (table === 'course_tees') return Promise.resolve({ data: teesData }).then(resolve)
          return Promise.resolve({ data: roundsData }).then(resolve)
        },
      }
      return b
    },
  } as unknown as SupabaseClient
}

const TEES = [
  { nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: null, back_slope_rating: null },
]

describe('applyDefaultTeeToRounds', () => {
  it('recomputa una ronda sin tee con el color por defecto (CR/slope + diferencial)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 90, holes_played: 18 }], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(n).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].tee_color).toBe('azul')
    expect(updates[0].course_rating).toBe(73.7)
    expect(updates[0].slope_rating).toBe(137)
    expect(Number(updates[0].diferencial)).toBeCloseTo(calcularDiferencial(90, 73.7, 137, 18)!, 2)
  })

  it('sin rondas sin tee → 0 actualizaciones', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'azul')
    expect(n).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('color que no matchea ningún tee → no actualiza (no inventa rating)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub([{ id: 'r1', course_id: 'c1', total_gross: 90, holes_played: 18 }], TEES, updates)
    const n = await applyDefaultTeeToRounds(sb, 'u1', 'inexistente')
    expect(n).toBe(0)
    expect(updates).toHaveLength(0)
  })
})
