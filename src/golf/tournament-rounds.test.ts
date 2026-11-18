import { describe, it, expect } from 'vitest'
import {
  CLOSED_ROUND_STATUSES_IN,
  activeRoundOf,
  esTarjetaCerrada,
  resolveRoundPlayConfig,
  resolveAllRoundPlayConfigs,
  rondaSigueEnJuego,
  tarjetaDeLaRonda,
  rondaVigenteDelRoster,
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

describe('activeRoundOf — la tarjeta abierta de mayor número, nunca rounds[0] por orden de llegada', () => {
  const r = (round_number: number, status: string, id = `r${round_number}`) => ({ id, round_number, status })

  it('con la ronda 1 cerrada y la 2 abierta → la 2, aunque venga primero en el array', () => {
    expect(activeRoundOf([r(2, 'in_progress'), r(1, 'closed')])?.id).toBe('r2')
    expect(activeRoundOf([r(1, 'closed'), r(2, 'in_progress')])?.id).toBe('r2')
  })

  it('con las dos abiertas → la de mayor número', () => {
    expect(activeRoundOf([r(1, 'in_progress'), r(2, 'in_progress')])?.id).toBe('r2')
  })

  it('todas cerradas → la última jugada (para mostrar, no para escribir)', () => {
    expect(activeRoundOf([r(2, 'official'), r(1, 'closed')])?.id).toBe('r2')
  })

  it('una sola ronda → esa; sin rondas → undefined', () => {
    expect(activeRoundOf([r(1, 'in_progress')])?.id).toBe('r1')
    expect(activeRoundOf([])).toBeUndefined()
    expect(activeRoundOf(null)).toBeUndefined()
  })

  it('round_number null cuenta como 1 (ordena debajo de la 2; si la 2 está cerrada y ella abierta, es la activa)', () => {
    expect(activeRoundOf([{ id: 'x', round_number: null, status: 'in_progress' }, r(2, 'closed')])?.id).toBe('x')
    expect(activeRoundOf([{ id: 'x', round_number: null, status: 'in_progress' }, r(2, 'in_progress')])?.id).toBe('r2')
  })
})

describe('esTarjetaCerrada / CLOSED_ROUND_STATUSES_IN — una sola definición de "cerrada"', () => {
  it('closed y official están cerradas; in_progress, null y "completed" (no existe) no', () => {
    expect(esTarjetaCerrada('closed')).toBe(true)
    expect(esTarjetaCerrada('official')).toBe(true)
    expect(esTarjetaCerrada('in_progress')).toBe(false)
    expect(esTarjetaCerrada('completed')).toBe(false)
    expect(esTarjetaCerrada(null)).toBe(false)
  })
  it('el filtro SQL se deriva de la misma lista', () => {
    expect(CLOSED_ROUND_STATUSES_IN).toBe('("closed","official")')
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

describe('rondaSigueEnJuego — solo cuentan las tarjetas abiertas de jugadores aprobados', () => {
  const j = (status: string, ...rounds: Array<[number, string]>) =>
    ({ status, rounds: rounds.map(([round_number, st]) => ({ round_number, status: st })) })

  it('la tarjeta abierta de un WD, DQ o pendiente no deja la ronda en juego', () => {
    const roster = [j('approved', [1, 'closed']), j('withdrawn', [1, 'in_progress']), j('disqualified', [1, 'in_progress']), j('pending', [1, 'in_progress'])]
    expect(rondaSigueEnJuego(roster, 1)).toBe(false)
  })
  it('un aprobado con la tarjeta abierta la deja en juego; official y closed son cerradas', () => {
    expect(rondaSigueEnJuego([j('approved', [1, 'official']), j('approved', [1, 'in_progress'])], 1)).toBe(true)
    expect(rondaSigueEnJuego([j('approved', [1, 'official']), j('approved', [1, 'closed'])], 1)).toBe(false)
  })
  it('mira solo la ronda pedida; round_number null es la 1', () => {
    const roster = [{ status: 'approved', rounds: [{ round_number: null, status: 'in_progress' }, { round_number: 2, status: 'closed' }] }]
    expect(rondaSigueEnJuego(roster, 1)).toBe(true)
    expect(rondaSigueEnJuego(roster, 2)).toBe(false)
  })
  it('sin status (roster viejo) no cuenta como aprobado', () => {
    expect(rondaSigueEnJuego([{ rounds: [{ round_number: 1, status: 'in_progress' }] }], 1)).toBe(false)
  })
})

describe('tarjetaDeLaRonda — la tarjeta de ESA ronda, sin fallback a otra (Fable #829)', () => {
  const r1 = { id: 'r1', round_number: 1, status: 'in_progress' }
  it('con la ronda 2 en juego, un jugador que solo tiene la tarjeta de la 1 no tiene tarjeta', () => {
    expect(tarjetaDeLaRonda([r1], 2)).toBeUndefined()
  })
  it('devuelve la de la ronda pedida; round_number null es la 1', () => {
    const r2 = { id: 'r2', round_number: 2, status: 'in_progress' }
    expect(tarjetaDeLaRonda([r1, r2], 2)).toBe(r2)
    expect(tarjetaDeLaRonda([{ id: 'x', round_number: null, status: 'closed' }], 1)?.id).toBe('x')
    expect(tarjetaDeLaRonda(null, 1)).toBeUndefined()
  })
})

describe('rondaVigenteDelRoster — mayor round_number del roster', () => {
  it('toma la mayor ronda con tarjeta; sin tarjetas es la 1; null es la 1', () => {
    expect(rondaVigenteDelRoster([{ rounds: [{ round_number: 1 }] }, { rounds: [{ round_number: 1 }, { round_number: 2 }] }])).toBe(2)
    expect(rondaVigenteDelRoster([{ rounds: [] }, { rounds: null }])).toBe(1)
    expect(rondaVigenteDelRoster([])).toBe(1)
    expect(rondaVigenteDelRoster([{ rounds: [{ round_number: null }] }])).toBe(1)
  })
})
