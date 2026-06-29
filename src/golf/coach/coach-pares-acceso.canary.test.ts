/**
 * CANARIO — acceso del coach a los pares por hoyo (invariante de "nunca se desconecta").
 *
 * Garantía: para CUALQUIER ronda que tenga score hoyo-a-hoyo + una fuente de par
 * (`par_per_hole` de la ronda O catálogo `course_holes`), las tools del coach DEBEN
 * devolver `par` y `vs_par` NO-NULL en cada hoyo jugado. Si esto falla, el coach ve
 * golpes sin saber si son buenos o malos → no puede identificar patrones (auditoría
 * 2026-06-28/29: el motor ignoraba `par_per_hole` → vs_par null en 25% de rondas).
 *
 * Este canario corre en CI (sin deps externas, fake Supabase) y FALLA EL DEPLOY si
 * alguien revierte la resolución de pares (resolveRoundPars / par_per_hole en el select).
 */
import { describe, it, expect } from 'vitest'
import { executeTool, type ToolExecutionContext } from './tools'

function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ['select', 'eq', 'not', 'order', 'limit', 'in', 'gte', 'lte', 'ilike']) builder[m] = chain
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return builder
}
function fakeSupabase(opts: { historical?: unknown[]; holes?: unknown[] }) {
  return {
    from(table: string) {
      if (table === 'historical_rounds') return makeBuilder({ data: opts.historical ?? [], error: null })
      if (table === 'course_holes') return makeBuilder({ data: opts.holes ?? [], error: null })
      return makeBuilder({ data: [], error: null })
    },
  } as unknown as ToolExecutionContext['supabase']
}
const ctx = (supabase: ToolExecutionContext['supabase']): ToolExecutionContext => ({
  supabase, userId: 'u1', defaultRondaId: null, sessionId: null,
})

type Hoyo = { hoyo: number; par: number | null; strokes: number; vs_par: number | null }
const getHoyos = (r: Awaited<ReturnType<typeof executeTool>>): Hoyo[] => {
  expect(r.ok).toBe(true)
  return (r as { ok: true; data: { hoyos: Hoyo[] } }).data.hoyos
}

// Layout par-71 real (no par-72 genérico): hoyos 1-9 con par-3/4/5 mezclados.
const PAR71_9 = { '1': 4, '2': 3, '3': 5, '4': 4, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4 } // suma 36
const SCORES_9 = [5, 4, 6, 4, 5, 2, 7, 4, 5] // vs-par esperado: +1,+1,+1,0,+1,-1,+2,0,+1

describe('CANARIO: el coach calcula vs-par de toda ronda con fuente de par', () => {
  it('ronda SIN cancha linkeada pero CON par_per_hole → par + vs_par no-null en cada hoyo', async () => {
    const sb = fakeSupabase({
      historical: [{
        id: 'r1', course_id: null, course_name: 'Cancha no linkeada', played_at: '2026-06-05T10:00:00',
        total_gross: 42, holes_played: 9, scores: SCORES_9, par_per_hole: PAR71_9, import_source: 'garmin',
      }],
      holes: [], // sin catálogo: la ÚNICA fuente es par_per_hole de la ronda
    })
    const hoyos = getHoyos(await executeTool('get_latest_round', {}, ctx(sb)))
    expect(hoyos.length).toBe(9)
    for (const h of hoyos) {
      expect(h.par, `hoyo ${h.hoyo} debe tener par (no null)`).not.toBeNull()
      expect(h.vs_par, `hoyo ${h.hoyo} debe tener vs_par (no null)`).not.toBeNull()
    }
    // los pares salen del par_per_hole REAL, no de par-4 genérico
    expect(hoyos.find(h => h.hoyo === 2)?.par).toBe(3)
    expect(hoyos.find(h => h.hoyo === 3)?.par).toBe(5)
    // vs_par = strokes - par real
    expect(hoyos.find(h => h.hoyo === 6)?.vs_par).toBe(-1) // 2 en par 3
    expect(hoyos.find(h => h.hoyo === 7)?.vs_par).toBe(2)  // 7 en par 5
  })

  it('ronda CON cancha linkeada (catálogo) y SIN par_per_hole → par + vs_par no-null', async () => {
    const sb = fakeSupabase({
      historical: [{
        id: 'r2', course_id: 'c1', course_name: 'Linkeada', played_at: '2026-06-05T10:00:00',
        total_gross: 42, holes_played: 9, scores: SCORES_9, par_per_hole: null, import_source: 'garmin',
      }],
      holes: Object.entries(PAR71_9).map(([n, par]) => ({ course_id: 'c1', numero: Number(n), par })),
    })
    const hoyos = getHoyos(await executeTool('get_latest_round', {}, ctx(sb)))
    expect(hoyos.length).toBe(9)
    for (const h of hoyos) {
      expect(h.par).not.toBeNull()
      expect(h.vs_par).not.toBeNull()
    }
    expect(hoyos.find(h => h.hoyo === 2)?.par).toBe(3)
  })

  it('par_per_hole PISA al catálogo (catálogo sucio Damas/Varones no contamina el vs-par)', async () => {
    const sb = fakeSupabase({
      historical: [{
        id: 'r3', course_id: 'c1', course_name: 'Linkeada a catálogo sucio', played_at: '2026-06-05T10:00:00',
        total_gross: 42, holes_played: 9, scores: SCORES_9, par_per_hole: PAR71_9, import_source: 'garmin',
      }],
      // catálogo MAL (todo par-4, como un catálogo corrupto/genérico)
      holes: Array.from({ length: 9 }, (_, i) => ({ course_id: 'c1', numero: i + 1, par: 4 })),
    })
    const hoyos = getHoyos(await executeTool('get_latest_round', {}, ctx(sb)))
    // gana el par_per_hole de la ronda (3 y 5), no el catálogo (4)
    expect(hoyos.find(h => h.hoyo === 2)?.par).toBe(3)
    expect(hoyos.find(h => h.hoyo === 3)?.par).toBe(5)
  })
})
