import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyDefaultTeeToRounds, recomputeRoundsFromCatalog } from './recompute-tee-rounds'
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

// Tee real de Los Leones azul/M (course_tees prod, course 8f64cd3a, 2026-06-09):
// 18h 73.7/137, front-9 37.2/132. El front-9 manda el diferencial de 9h.
const TEES_LEONES_AZUL = [
  { nombre: 'azul', genero: 'M', rating: 73.7, slope: 137, front_course_rating: 37.2, front_slope_rating: 132, back_course_rating: 36.5, back_slope_rating: 142 },
]

describe('recomputeRoundsFromCatalog', () => {
  it('rondas idénticas (mismo score/tee/hoyos) con diferencial congelado distinto → todas re-derivan al MISMO valor del catálogo', async () => {
    // El bug reportado: 3 rondas Los Leones azul, 9h, score 38, con diferencial
    // congelado 0.70 / 1.37 / 2.24. Deben converger al único valor correcto.
    const updates: Record<string, unknown>[] = []
    const rounds = [
      { id: 'r1', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 37.2, slope_rating: 132, diferencial: 0.70 },
      { id: 'r2', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 1.37 },
      { id: 'r3', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 },
    ]
    const sb = stub(rounds, TEES_LEONES_AZUL, updates)

    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: true, genero: null })

    // El valor canónico del catálogo (front-9 37.2/132, escalado a equivalente-18h).
    const esperado = calcularDiferencial(38, 73.7, 137, 9, { cr9h: 37.2, slope9h: 132 })!
    expect(esperado).toBeCloseTo(1.37, 2)

    // Las 3 rondas re-derivan al MISMO diferencial (consistencia = el fix).
    expect(result.rounds).toHaveLength(3)
    const distintos = new Set(result.rounds.map(r => r.after.diferencial))
    expect(distintos.size).toBe(1)
    for (const r of result.rounds) {
      expect(r.after.diferencial).toBeCloseTo(esperado, 2)
      expect(r.after.course_rating).toBe(73.7)
      expect(r.after.slope_rating).toBe(137)
    }

    // El diferencial cambia en las 2 que estaban mal (0.70 y 2.24); la de 1.37 ya
    // tenía el valor correcto. (El CR/slope 18h se corrige en las 3 pero es
    // cosmético en 9h: no entra al diferencial.)
    const cambiaronDif = result.rounds.filter(r => r.before.diferencial !== r.after.diferencial)
    expect(cambiaronDif).toHaveLength(2)

    // dryRun: NO escribe en la BD.
    expect(result.applied).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('dryRun:false aplica el update (escribe CR/slope/diferencial del catálogo)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'r1', course_id: 'leones', tee_color: 'azul', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.applied).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].course_rating).toBe(73.7)
    expect(updates[0].slope_rating).toBe(137)
    expect(Number(updates[0].diferencial)).toBeCloseTo(1.37, 2)
  })

  it('score físicamente imposible (46 en 18h) → implausible, no recomputa y SE EXCLUYE en apply', async () => {
    // Caso real (ronda c314a556 de Juanjo): 18h con total 46. Su diferencial NO se
    // recomputa (es absurdo), pero en apply debe EXCLUIRSE del handicap: si no, el
    // RPC lo tomaría como "el mejor" y hundiría el índice. Esa exclusión es la
    // única forma de que el endpoint repare el índice por sí solo.
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'bad', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: null, slope_rating: null, diferencial: null }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.implausible).toHaveLength(1)
    expect(result.implausible[0].id).toBe('bad')
    expect(result.rounds.find(r => r.id === 'bad')).toBeUndefined()
    expect(result.excludedImplausible).toBe(1)
    expect(result.failedUpdates).toBe(0)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ excluded_from_handicap: true })
  })

  it('implausible con diferencial congelado NEGATIVO → se excluye (no hunde el índice vía RPC)', async () => {
    // El escenario que corrompe de verdad: la ronda ya trae un diferencial
    // congelado absurdo (−22.85) del import. El recompute no lo toca; el apply
    // DEBE excluirla para que el RPC no la consuma como mejor diferencial.
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'frozen', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: 75.1, slope_rating: 142, diferencial: -22.85 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.implausible.map(i => i.id)).toEqual(['frozen'])
    expect(result.excludedImplausible).toBe(1)
    expect(updates).toEqual([{ excluded_from_handicap: true }])
  })

  it('en dryRun una implausible se detecta pero NO se escribe nada', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'bad', course_id: 'leones', tee_color: 'azul', holes_played: 18, total_gross: 46, course_rating: null, slope_rating: null, diferencial: -22.85 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: true, genero: null })
    expect(result.implausible).toHaveLength(1)
    expect(result.excludedImplausible).toBe(0)
    expect(updates).toHaveLength(0)
  })

  it('tee que no matchea el catálogo → unresolved, no se toca (no inventa rating)', async () => {
    const updates: Record<string, unknown>[] = []
    const sb = stub(
      [{ id: 'r1', course_id: 'leones', tee_color: 'inexistente', holes_played: 9, total_gross: 38, course_rating: 73.3, slope_rating: 136, diferencial: 2.24 }],
      TEES_LEONES_AZUL,
      updates,
    )
    const result = await recomputeRoundsFromCatalog(sb, 'u1', { dryRun: false, genero: null })
    expect(result.resolved).toBe(0)
    expect(result.unresolved).toHaveLength(1)
    expect(result.unresolved[0].id).toBe('r1')
    expect(updates).toHaveLength(0)
  })
})
