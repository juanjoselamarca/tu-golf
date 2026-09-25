import { describe, it, expect } from 'vitest'
import {
  resolveRoundPlayConfig,
  resolveAllRoundPlayConfigs,
  roundDiffersFromBase,
} from './tournament-rounds'

const TORNEO = { course_id: 'cancha-A', hole_count: 18, date_start: '2026-10-10', total_rounds: 3 }
const FILAS = [
  { round_number: 2, course_id: 'cancha-B', hole_count: 9, date: '2026-10-11' },
  { round_number: 3, course_id: 'cancha-A', hole_count: 18, date: '2026-10-12' },
]

describe('resolveRoundPlayConfig — una regla para "qué cancha se juega en la ronda N"', () => {
  it('la ronda 1 sale SIEMPRE de tournaments.*, aunque haya filas', () => {
    const r = resolveRoundPlayConfig(TORNEO, [
      { round_number: 1, course_id: 'otra', hole_count: 9, date: '2000-01-01' },
      ...FILAS,
    ], 1)
    expect(r).toEqual({
      roundNumber: 1, courseId: 'cancha-A', holeCount: 18, date: '2026-10-10', source: 'tournament',
    })
  })

  it('la ronda 2 sale de su fila en tournament_rounds (cancha y hoyos propios)', () => {
    const r = resolveRoundPlayConfig(TORNEO, FILAS, 2)
    expect(r).toEqual({
      roundNumber: 2, courseId: 'cancha-B', holeCount: 9, date: '2026-10-11', source: 'tournament_rounds',
    })
  })

  it('una ronda ≥ 2 sin fila hereda la cancha de la ronda 1 y lo DICE (fallback explícito)', () => {
    const r = resolveRoundPlayConfig(TORNEO, [], 2)
    expect(r.courseId).toBe('cancha-A')
    expect(r.holeCount).toBe(18)
    expect(r.date).toBeNull()
    expect(r.source).toBe('tournament_fallback')
  })

  it('una fila con course_id null es config real: NO cae a la ronda 1', () => {
    const r = resolveRoundPlayConfig(TORNEO, [{ round_number: 2, course_id: null, hole_count: 18, date: null }], 2)
    expect(r.courseId).toBeNull()
    expect(r.source).toBe('tournament_rounds')
  })

  it('sin hole_count en la fila ni en el torneo, 18', () => {
    const r = resolveRoundPlayConfig(
      { course_id: null, hole_count: null, date_start: null },
      [{ round_number: 2, course_id: null, hole_count: null, date: null }],
      2,
    )
    expect(r.holeCount).toBe(18)
  })

  it('roundNumber 0 o negativo se trata como ronda 1', () => {
    expect(resolveRoundPlayConfig(TORNEO, FILAS, 0).source).toBe('tournament')
  })
})

describe('resolveAllRoundPlayConfigs', () => {
  it('devuelve total_rounds entradas, 1..N, cada una con su fuente', () => {
    const all = resolveAllRoundPlayConfigs(TORNEO, FILAS)
    expect(all.map((r) => r.roundNumber)).toEqual([1, 2, 3])
    expect(all.map((r) => r.source)).toEqual(['tournament', 'tournament_rounds', 'tournament_rounds'])
    expect(all.map((r) => r.courseId)).toEqual(['cancha-A', 'cancha-B', 'cancha-A'])
  })

  it('total_rounds null o 0 → una sola ronda', () => {
    expect(resolveAllRoundPlayConfigs({ ...TORNEO, total_rounds: null }, FILAS)).toHaveLength(1)
    expect(resolveAllRoundPlayConfigs({ ...TORNEO, total_rounds: 0 }, FILAS)).toHaveLength(1)
  })
})

describe('roundDiffersFromBase', () => {
  const base = resolveRoundPlayConfig(TORNEO, FILAS, 1)
  it('otra cancha → difiere', () => {
    expect(roundDiffersFromBase(base, resolveRoundPlayConfig(TORNEO, FILAS, 2))).toBe(true)
  })
  it('misma cancha y hoyos → no difiere (la ronda 3 reusa el contexto de la 1)', () => {
    expect(roundDiffersFromBase(base, resolveRoundPlayConfig(TORNEO, FILAS, 3))).toBe(false)
  })
  it('misma cancha, distinta cantidad de hoyos → difiere', () => {
    const r = resolveRoundPlayConfig(TORNEO, [{ round_number: 2, course_id: 'cancha-A', hole_count: 9, date: null }], 2)
    expect(roundDiffersFromBase(base, r)).toBe(true)
  })
})
