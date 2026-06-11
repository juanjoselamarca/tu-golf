import { describe, it, expect } from 'vitest'
import { buildMockExecuteTool } from '../mock-executor'
import { EXAM_CASES } from '../fixtures'

const lomas = EXAM_CASES.find((c) => c.id === 'captura1_indice_vs_hcp')!

describe('buildMockExecuteTool — executeTool en memoria desde el seed', () => {
  it('find_rounds devuelve el conteo y las rondas sembradas de la cancha', async () => {
    const exec = buildMockExecuteTool({ rounds: lomas.seed.rounds })
    const r = (await exec('find_rounds', { course: 'Lomas de la Dehesa' })) as {
      ok: boolean
      data: { count: number; rounds: unknown[] }
    }
    expect(r.ok).toBe(true)
    expect(r.data.count).toBe(lomas.seed.rounds.length)
    expect(r.data.rounds).toHaveLength(lomas.seed.rounds.length)
  })

  it('find_rounds filtra por nombre de cancha (no devuelve otras)', async () => {
    const exec = buildMockExecuteTool({
      rounds: [
        ...lomas.seed.rounds,
        { course: 'Otra Cancha', course_id: 'x', total: 90, holes: 18, played_at: '2026-01-01' },
      ],
    })
    const r = (await exec('find_rounds', { course: 'Lomas' })) as { data: { count: number } }
    expect(r.data.count).toBe(lomas.seed.rounds.length)
  })

  it('get_course_scorecard devuelve par_total y pares cuando hay scorecard sembrado', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('get_course_scorecard', { course: 'Lomas de la Dehesa' })) as {
      ok: boolean
      data: { par_total: number }
    }
    expect(r.ok).toBe(true)
    expect(r.data.par_total).toBe(72)
  })

  it('get_course_scorecard degrada honesto (ok:false, sin pedir pares) si no hay scorecard', async () => {
    const exec = buildMockExecuteTool({ rounds: lomas.seed.rounds })
    const r = (await exec('get_course_scorecard', { course: 'Cancha Desconocida' })) as {
      ok: boolean
      error?: string
    }
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no.*pidas|catalog/i)
  })

  it('get_playing_handicap devuelve índice y handicap de juego DISTINTOS desde el seed', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('get_playing_handicap', { course: 'Lomas de la Dehesa' })) as {
      ok: boolean
      data: { indice: number; handicap_de_juego: number }
    }
    expect(r.ok).toBe(true)
    expect(r.data.indice).toBe(10)
    expect(r.data.handicap_de_juego).toBe(14)
  })

  it('una tool no sembrada degrada honesto (ok:false), nunca inventa', async () => {
    const exec = buildMockExecuteTool({ rounds: [] })
    const r = (await exec('get_playing_handicap', { course: 'Lomas' })) as { ok: boolean }
    expect(r.ok).toBe(false)
  })
})
