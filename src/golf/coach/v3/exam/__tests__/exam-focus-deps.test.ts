import { describe, it, expect } from 'vitest'
import { buildExamFocusDeps } from '../exam-focus-deps'
import { getFocus } from '../../focus/get-focus'
import type { ExamSeed, ExamSeedRound } from '../fixtures'

const PARES_72 = Array.from({ length: 18 }, () => 4)

/** scores como objeto `{"1":n,…}` para front9=frontScore, back9=backScore. */
function collapseScores(frontScore: number, backScore: number): Record<string, number> {
  const s: Record<string, number> = {}
  for (let h = 1; h <= 18; h++) s[String(h)] = h <= 9 ? frontScore : backScore
  return s
}

function round(scores: Record<string, number>, total: number, i: number): ExamSeedRound {
  return {
    course: 'Test GC',
    course_id: 'test-course',
    total,
    holes: 18,
    played_at: `2026-0${i + 1}-15`,
    scores,
  }
}

/** Seed con back-9 muy peor que front-9 (gatilla back-nine collapse). */
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

describe('buildExamFocusDeps + getFocus (motor real, deps congeladas)', () => {
  it('corre el motor real sin DB y devuelve un resultado válido', async () => {
    const res = await getFocus('exam-user', buildExamFocusDeps(collapseSeed))
    expect(res.kind === 'focus' || res.kind === 'fallback').toBe(true)
  })

  it('es DETERMINISTA: dos corridas con el mismo seed dan el mismo foco', async () => {
    const a = await getFocus('exam-user', buildExamFocusDeps(collapseSeed))
    const b = await getFocus('exam-user', buildExamFocusDeps(collapseSeed))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('con un patrón fuerte (back-9 collapse) devuelve un FOCO, no fallback', async () => {
    const res = await getFocus('exam-user', buildExamFocusDeps(collapseSeed))
    expect(res.kind).toBe('focus')
  })

  it('con <3 rondas cae a fallback (gate del motor aplica)', async () => {
    const tiny: ExamSeed = { ...collapseSeed, rounds: collapseSeed.rounds.slice(0, 2) }
    const res = await getFocus('exam-user', buildExamFocusDeps(tiny))
    expect(res.kind).toBe('fallback')
  })
})
