import { describe, it, expect } from 'vitest'
import { buildMockExecuteTool } from '../mock-executor'
import { EXAM_CASES, type ExamSeed, type ExamSeedRound } from '../fixtures'

const lomas = EXAM_CASES.find((c) => c.id === 'captura1_indice_vs_hcp')!

const PARES_72 = Array.from({ length: 18 }, () => 4)

/** scores `{"1":front,…"10":back,…}` para front9=front, back9=back (collapse). */
function collapseScores(front: number, back: number): Record<string, number> {
  const s: Record<string, number> = {}
  for (let h = 1; h <= 18; h++) s[String(h)] = h <= 9 ? front : back
  return s
}
function round(scores: Record<string, number>, total: number, i: number): ExamSeedRound {
  return { course: 'Test GC', course_id: 'test-course', total, holes: 18, played_at: `2026-0${i + 1}-15`, scores }
}
/** Seed con back-9 muy peor que front-9 → gatilla un patrón fuerte (no fallback). */
const collapseSeed: ExamSeed = {
  scorecard: { course: 'Test GC', course_id: 'test-course', par_total: 72, pares: PARES_72 },
  handicap: {
    cancha: 'Test GC', course_id: 'test-course', indice: 12, handicap_de_juego: 13,
    holes: 18, tee: 'amarillo', course_rating: 71, slope: 124,
  },
  rounds: [
    round(collapseScores(4, 8), 108, 0),
    round(collapseScores(4, 8), 108, 1),
    round(collapseScores(5, 8), 117, 2),
    round(collapseScores(4, 7), 99, 3),
  ],
}

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

  it('RAG (search_knowledge_chunks) cae al default honesto (examen sin retrieval, D4)', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('search_knowledge_chunks', { query: 'regla de drop' })) as { ok: boolean }
    expect(r.ok).toBe(false)
  })
})

describe('buildMockExecuteTool — tools v3 (cerebro v3, P2)', () => {
  it('get_focus corre el motor REAL y devuelve un FOCO con un patrón fuerte', async () => {
    const exec = buildMockExecuteTool(collapseSeed)
    const r = (await exec('get_focus', {})) as { ok: boolean; data: { kind: string } }
    expect(r.ok).toBe(true)
    expect(r.data.kind).toBe('focus')
  })

  it('get_focus es DETERMINISTA: dos llamadas con el mismo seed dan el mismo foco', async () => {
    const a = await exec_get_focus(collapseSeed)
    const b = await exec_get_focus(collapseSeed)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('get_focus sin scores por hoyo cae a fallback (gate real del motor, no stub)', async () => {
    // Los seeds del banco aún no traen scores[] (P3 los agrega) → fallback honesto.
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('get_focus', {})) as { ok: boolean; data: { kind: string } }
    expect(r.ok).toBe(true)
    expect(r.data.kind).toBe('fallback')
  })

  it('set_target válido devuelve éxito con la meta, SIN escribir (admin no-op)', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('set_target', { handicap: 8, deadline: '2026-12-31' })) as {
      ok: boolean
      data: { target_handicap: number; target_deadline: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data.target_handicap).toBe(8)
    expect(r.data.target_deadline).toBe('2026-12-31')
  })

  it('set_target reusa la validación real: handicap fuera de rango → ok:false', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('set_target', { handicap: 999 })) as { ok: boolean; error?: string }
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/handicap/i)
  })

  it('remember_fact devuelve éxito con el hecho, SIN escribir', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('remember_fact', { category: 'goal', fact: 'quiere bajar a 8', confidence: 0.9 })) as {
      ok: boolean
      data: { category: string; fact: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data.category).toBe('goal')
    expect(r.data.fact).toBe('quiere bajar a 8')
  })

  it('recall_facts devuelve el shape vacío honesto (sin memoria sembrada)', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('recall_facts', {})) as { ok: boolean; data: { facts: unknown[] } }
    expect(r.ok).toBe(true)
    expect(r.data.facts).toEqual([])
  })

  it('get_progress devuelve el shape vacío de prod (sin serie sembrada, no escribe)', async () => {
    const exec = buildMockExecuteTool(lomas.seed)
    const r = (await exec('get_progress', {})) as {
      ok: boolean
      data: { round_metrics: unknown[]; active_plan: unknown; outcomes: unknown[] }
    }
    expect(r.ok).toBe(true)
    expect(r.data.round_metrics).toEqual([])
    expect(r.data.active_plan).toBeNull()
    expect(r.data.outcomes).toEqual([])
  })
})

async function exec_get_focus(seed: ExamSeed) {
  const exec = buildMockExecuteTool(seed)
  return (await exec('get_focus', {})) as { ok: boolean; data: unknown }
}
