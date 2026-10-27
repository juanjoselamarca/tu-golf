// Par de la ronda y par de 18 del contexto del handicap de equipo: los dos salen
// de `parDeLaRondaDelTorneo` (una cancha de 9 se recorre dos veces), nunca de
// `courses.par_total` crudo, que en una cancha de 9 es el par de UNA vuelta.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

let hoyos: Array<{ numero: number; par: number }> = []
let parTotalDeLaCancha: number | null = null

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('./leaderboard', () => ({
  fetchCourseHoles: async () => hoyos,
  fetchLegacyHcpContext: async () => ({
    mode: 'whs', tees: 'azul', courseTees: [], hcpPct: 100,
    course: { par_total: parTotalDeLaCancha, slope_rating: 113, course_rating: 72 },
  }),
}))

import { fetchContextoHcpDeEquipos } from './startTournament'

const torneo = { id: 't1', format: null, formato_juego: 'scramble', tees: 'azul', course_name: null, courses: null }
const svc = {} as SupabaseClient
// Cancha de 9 hoyos par 35: 4,4,3,5,4,4,3,4,4.
const nueveHoyosPar35 = [4, 4, 3, 5, 4, 4, 3, 4, 4].map((par, i) => ({ numero: i + 1, par }))

beforeEach(() => {
  hoyos = []
  parTotalDeLaCancha = null
})

describe('fetchContextoHcpDeEquipos', () => {
  it('cancha de 9 (par 35) en un torneo de 9: par de la ronda 35 y par de 18 = dos vueltas (70)', async () => {
    hoyos = nueveHoyosPar35
    parTotalDeLaCancha = 35
    const ctx = await fetchContextoHcpDeEquipos(svc, torneo, { courseId: 'c9', holeCount: 9, date: null })
    expect(ctx?.parTotal).toBe(35)
    expect(ctx?.parDe18Hoyos).toBe(70)
  })

  it('sin catálogo de hoyos: el par de 18 sale de courses.par_total (71)', async () => {
    parTotalDeLaCancha = 71
    const ctx = await fetchContextoHcpDeEquipos(svc, torneo, { courseId: 'c18', holeCount: 9, date: null })
    expect(ctx?.parDe18Hoyos).toBe(71)
  })

  it('best ball no tiene handicap de equipo: sin contexto', async () => {
    const ctx = await fetchContextoHcpDeEquipos(svc, { ...torneo, formato_juego: 'best_ball' }, { courseId: 'c18', holeCount: 18, date: null })
    expect(ctx).toBeNull()
  })
})
