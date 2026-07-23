/**
 * Tests de findRoundsForCoach — fuente única (historical_rounds), búsqueda
 * flexible por cancha / hole-count / orden. Regresión del P0 de campo: el coach
 * no podía listar "mis rondas en Lomas" sin fecha exacta.
 */
import { describe, it, expect } from 'vitest'
import { findRoundsForCoach } from './coach-rounds'
import type { SupabaseClient } from '@supabase/supabase-js'

const LOMAS_ID = 'dff847e1-34d9-4805-85a7-01ec3e554f65'

const COURSES = [
  { id: LOMAS_ID, nombre: 'Club de Golf Lomas de La Dehesa', fuente: 'fedegolf', canonical_course_id: null },
  { id: 'leones-0000-0000-0000-000000000001', nombre: 'Club de Golf Los Leones', fuente: 'fedegolf', canonical_course_id: null },
]

const ROUNDS = [
  { id: 'r1', course_id: LOMAS_ID, course_name: 'Club de Golf Lomas de La Dehesa', played_at: '2024-07-14T12:00:00', total_gross: 98, holes_played: 18, scores: null, import_source: 'garmin' },
  { id: 'r2', course_id: LOMAS_ID, course_name: 'Club Golf Lomas De La Dehesa', played_at: '2026-03-19T12:00:00', total_gross: 86, holes_played: 18, scores: null, import_source: 'garmin' },
  { id: 'r3', course_id: LOMAS_ID, course_name: 'Club de Golf Lomas de La Dehesa', played_at: '2024-08-31T12:00:00', total_gross: 50, holes_played: 9, scores: null, import_source: null },
  { id: 'r4', course_id: 'leones-0000-0000-0000-000000000001', course_name: 'Club de Golf Los Leones', played_at: '2025-01-10T12:00:00', total_gross: 90, holes_played: 18, scores: null, import_source: 'garmin' },
]

function fakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'historical_rounds') {
        const q: Record<string, unknown> = {}
        const chain = () => q
        Object.assign(q, {
          select: chain, eq: chain, or: chain, not: chain, gte: chain, lte: chain, order: chain,
          then: (resolve: (v: unknown) => void) => resolve({ data: ROUNDS, error: null }),
        })
        return q
      }
      if (table === 'courses') {
        return {
          select: () => ({
            ilike: (_c: string, pat: string) => {
              const needle = pat.replace(/%/g, '').toLowerCase()
              return Promise.resolve({ data: COURSES.filter(c => c.nombre.toLowerCase().includes(needle)), error: null })
            },
          }),
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  } as unknown as SupabaseClient
}

describe('findRoundsForCoach', () => {
  it('lista las rondas de una cancha por NOMBRE (sin fecha exacta)', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', { course: 'Lomas de la Dehesa' })
    // 3 rondas en Lomas (r1, r2, r3), NO la de Los Leones.
    expect(out.count).toBe(3)
    expect(out.rounds.every(r => r.cancha?.toLowerCase().includes('lomas'))).toBe(true)
    expect(out.resolved_course?.course_id).toBe(LOMAS_ID)
  })

  it('ordena por reciente por defecto', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', { course: 'Lomas' })
    expect(out.rounds[0].id).toBe('r2') // 2026-03-19 es la más nueva
  })

  it('orden "mejor" devuelve el score más bajo primero', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', { course: 'Lomas', orden: 'mejor', holes: 18 })
    // entre las 18h de Lomas (98, 86) el mejor es 86
    expect(out.rounds[0].total_gross).toBe(86)
  })

  it('filtra por hole-count (9h)', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', { course: 'Lomas', holes: 9 })
    expect(out.count).toBe(1)
    expect(out.rounds[0].id).toBe('r3')
  })

  it('deriva source desde import_source (null = en_vivo)', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', { course: 'Lomas', holes: 9 })
    expect(out.rounds[0].source).toBe('en_vivo') // r3 tiene import_source null
  })

  it('sin filtro de cancha devuelve todo el historial', async () => {
    const out = await findRoundsForCoach(fakeSupabase(), 'u-juanjo', {})
    expect(out.count).toBe(4)
  })
})
