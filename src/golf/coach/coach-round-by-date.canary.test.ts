import { describe, it, expect } from 'vitest'
import { executeTool, type ToolExecutionContext } from './tools'

/**
 * CANARIO — `get_round_by_date` contra la columna `historical_rounds.played_at`,
 * que es de tipo DATE (no timestamp).
 *
 * Bug detectado 2026-06-29: el tool filtraba con un rango de TIMESTAMP
 *   .gte('played_at', `${date}T00:00:00`).lt('played_at', `${date}T23:59:59`)
 * Postgres/PostgREST castea esos literales a DATE (trunca la hora) al compararlos
 * contra una columna DATE → el filtro queda `played_at >= D AND played_at < D`,
 * una contradicción que devuelve CERO filas para CUALQUIER fecha. Resultado:
 * el coach respondía "no hay rondas en esa fecha" y NO podía traer el hoyo-por-hoyo
 * de una ronda importada puntual — defraudando el fix #214 (que manda al coach a
 * usar esta tool para el detalle de rondas importadas).
 *
 * Este mock reproduce la semántica DATE real: todo literal comparado contra
 * `played_at` se trunca a YYYY-MM-DD antes de comparar. Si el tool vuelve a usar
 * un rango de timestamp, este test falla.
 */

// PG: literal comparado contra columna DATE se castea a DATE (se trunca la hora).
const toDate = (v: unknown): string => String(v).slice(0, 10)

type Round = {
  id: string
  user_id: string
  course_id: string | null
  course_name: string | null
  played_at: string
  scores: number[]
  total_gross: number
  holes_played: number
  par_per_hole: Record<string, number> | null
}

function makeCtx(rounds: Round[]): ToolExecutionContext {
  const supabase = {
    from(table: string) {
      if (table === 'course_holes') {
        // loadParsByCourse: from → select → in (await). Sin cancha linkeada → vacío.
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
      }
      // historical_rounds: from → select → eq(user) → [filtros played_at] → order (await)
      const filters: Array<(r: Round) => boolean> = []
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          if (col === 'played_at') filters.push((r) => toDate(r.played_at) === toDate(val))
          else if (col === 'user_id') filters.push((r) => r.user_id === val)
          return builder
        },
        gte: (col: string, val: unknown) => {
          if (col === 'played_at') filters.push((r) => toDate(r.played_at) >= toDate(val))
          return builder
        },
        lte: (col: string, val: unknown) => {
          if (col === 'played_at') filters.push((r) => toDate(r.played_at) <= toDate(val))
          return builder
        },
        lt: (col: string, val: unknown) => {
          if (col === 'played_at') filters.push((r) => toDate(r.played_at) < toDate(val))
          return builder
        },
        ilike: () => builder,
        order: () => Promise.resolve({ data: rounds.filter((r) => filters.every((f) => f(r))), error: null }),
      }
      return builder
    },
  }
  return { supabase: supabase as never, userId: 'u1', defaultRondaId: null, sessionId: null }
}

const importedRound: Round = {
  id: 'r1',
  user_id: 'u1',
  course_id: null, // ronda importada SIN cancha linkeada (caso #214/#217)
  course_name: 'Las Brisas ~ Norte-Este',
  played_at: '2026-06-27', // columna DATE
  scores: Array.from({ length: 18 }, () => 5),
  total_gross: 90,
  holes_played: 18,
  par_per_hole: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4])),
}

describe('get_round_by_date · columna played_at es DATE', () => {
  it('encuentra la ronda por fecha (no usa rango de timestamp que se trunca a contradicción)', async () => {
    const ctx = makeCtx([importedRound])
    const res = await executeTool('get_round_by_date', { date: '2026-06-27' }, ctx)
    expect(res.ok).toBe(true)
    const data = (res as { ok: true; data: { count: number; rounds: unknown[] } }).data
    expect(data.count).toBe(1)
    expect(data.rounds).toHaveLength(1)
  })

  it('devuelve el hoyo-por-hoyo con pares desde par_per_hole de la ronda importada (#214/#217)', async () => {
    const ctx = makeCtx([importedRound])
    const res = await executeTool('get_round_by_date', { date: '2026-06-27' }, ctx)
    const round = (res as { ok: true; data: { rounds: Array<Record<string, unknown>> } }).data.rounds[0]
    const hoyos = round.hoyos as Array<{ par: number | null }>
    expect(Array.isArray(hoyos)).toBe(true)
    expect(hoyos).toHaveLength(18)
    // El fix #217 garantiza par desde par_per_hole aun sin cancha linkeada.
    expect(hoyos.every((h) => h.par === 4)).toBe(true)
    expect(round.total_par).toBe(72)
  })
})
