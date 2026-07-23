/**
 * Regresión del P0 de campo (inbox 2026-06-09): get_recent_rounds y
 * get_latest_round leían SOLO las tablas en-vivo (ronda_libre_jugadores /
 * rondas_libres). Un usuario importado-only (ej. Nicolás, 125 rondas
 * importadas, 0 en-vivo) recibía "no tenés rondas" — el coach no alcanzaba su
 * propia data. Ahora ambas leen la fuente única `historical_rounds`.
 */
import { describe, it, expect } from 'vitest'
import { executeTool, type ToolExecutionContext } from './tools'

/** Builder chainable + thenable: cualquier método encadena y el objeto resuelve
 *  al resultado configurado al hacer await. Cubre los chains de
 *  findRoundsForCoach (.select.eq.not[.gte.lte]) y getLatestRound
 *  (.select.eq.not.order.limit) y loadParsByCourse (.select.in). */
function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ['select', 'eq', 'or', 'not', 'order', 'limit', 'in', 'gte', 'lte', 'ilike']) {
    builder[m] = chain
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return builder
}

type FakeOpts = { historical?: unknown[]; holes?: unknown[] }

function fakeSupabase(opts: FakeOpts) {
  const queried: string[] = []
  const sb = {
    from(table: string) {
      queried.push(table)
      if (table === 'historical_rounds') return makeBuilder({ data: opts.historical ?? [], error: null })
      if (table === 'course_holes') return makeBuilder({ data: opts.holes ?? [], error: null })
      // Las tablas en-vivo NO deben tocarse — si se tocan, el test lo caza abajo.
      return makeBuilder({ data: [], error: null })
    },
    queried,
  }
  return sb as unknown as ToolExecutionContext['supabase'] & { queried: string[] }
}

const ctx = (supabase: ToolExecutionContext['supabase']): ToolExecutionContext => ({
  supabase,
  userId: 'u1',
  defaultRondaId: null,
  sessionId: null,
})

describe('get_recent_rounds / get_latest_round — fuente única historical_rounds', () => {
  it('get_recent_rounds lee historical_rounds y un usuario importado-only ve sus rondas', async () => {
    const sb = fakeSupabase({
      historical: [
        { id: 'r1', course_id: null, course_name: 'Lomas', played_at: '2026-06-01T10:00:00', total_gross: 86, holes_played: 18, scores: null, import_source: 'garmin' },
        { id: 'r2', course_id: null, course_name: 'Los Leones', played_at: '2026-05-20T10:00:00', total_gross: 90, holes_played: 18, scores: null, import_source: 'garmin' },
      ],
    })
    const r = await executeTool('get_recent_rounds', { limit: 5 }, ctx(sb))
    expect(r.ok).toBe(true)
    const data = (r as { ok: true; data: { rondas: Array<{ source: string }> } }).data
    expect(data.rondas.length).toBe(2)
    expect(data.rondas[0].source).toBe('importada')
    expect((sb as unknown as { queried: string[] }).queried).toContain('historical_rounds')
    expect((sb as unknown as { queried: string[] }).queried).not.toContain('ronda_libre_jugadores')
  })

  it('get_latest_round lee historical_rounds y arma el detalle hoyo-a-hoyo', async () => {
    const sb = fakeSupabase({
      historical: [
        { id: 'r9', course_id: 'c1', course_name: 'Lomas', played_at: '2026-06-05T10:00:00', total_gross: 40, holes_played: 9, scores: [5, 4, 4, 5, 4, 4, 4, 5, 5], import_source: 'garmin' },
      ],
      holes: Array.from({ length: 9 }, (_, i) => ({ course_id: 'c1', numero: i + 1, par: 4 })),
    })
    const r = await executeTool('get_latest_round', {}, ctx(sb))
    expect(r.ok).toBe(true)
    const data = (r as { ok: true; data: { hoyos: unknown[]; total_strokes: number } }).data
    expect(data.hoyos.length).toBe(9)
    expect(data.total_strokes).toBe(40)
    expect((sb as unknown as { queried: string[] }).queried).not.toContain('ronda_libre_jugadores')
  })

  it('get_latest_round tolera scores en forma de objeto {"1":n,…}', async () => {
    const sb = fakeSupabase({
      historical: [
        { id: 'r7', course_id: 'c1', course_name: 'Lomas', played_at: '2026-06-05T10:00:00', total_gross: 18, holes_played: 4, scores: { '1': 4, '2': 5, '3': 4, '4': 5 }, import_source: 'garmin' },
      ],
      holes: Array.from({ length: 4 }, (_, i) => ({ course_id: 'c1', numero: i + 1, par: 4 })),
    })
    const r = await executeTool('get_latest_round', {}, ctx(sb))
    expect(r.ok).toBe(true)
    const data = (r as { ok: true; data: { hoyos: unknown[]; total_strokes: number } }).data
    expect(data.hoyos.length).toBe(4)
    expect(data.total_strokes).toBe(18)
  })

  it('get_latest_round sin rondas degrada honesto (no inventa, no culpa)', async () => {
    const sb = fakeSupabase({ historical: [] })
    const r = await executeTool('get_latest_round', {}, ctx(sb))
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/no tiene rondas/i)
  })
})
