import { describe, it, expect } from 'vitest'
import { computeScrambleStandings, computeFoursomeStandings } from './team-standings'
import type { ScrambleTeam } from '@/golf/formats'

// Par 4 en los 3 hoyos, stroke index 1..3. parTotal 12.
const HOLES = [
  { numero: 1, par: 4, stroke_index: 1 },
  { numero: 2, par: 4, stroke_index: 2 },
  { numero: 3, par: 4, stroke_index: 3 },
]

function team(id: string, nombre: string, handicaps: number[], scores: Record<string, number>): ScrambleTeam {
  return { id, nombre, handicaps, scores }
}

describe('computeScrambleStandings', () => {
  it('ordena por score neto ascendente (mejor primero)', () => {
    const teams = [
      team('a', 'Águilas', [10, 12], { '1': 5, '2': 5, '3': 5 }), // gross 15
      team('b', 'Cóndores', [2, 4], { '1': 4, '2': 4, '3': 4 }),  // gross 12
    ]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out.map((t) => t.teamId)).toEqual(['b', 'a'])
    expect(out[0].holesPlayed).toBe(3)
  })

  it('equipo sin scores → holesPlayed 0, no crashea', () => {
    const teams = [team('c', 'Vacío', [10, 10], {})]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out).toHaveLength(1)
    expect(out[0].holesPlayed).toBe(0)
  })

  it('aplica handicap de equipo (2 jugadores: 35% menor + 15% mayor) reduce el neto', () => {
    // handicaps [10,20] → team hcp = 0.35*10 + 0.15*20 = 6.5
    const teams = [team('d', 'X', [10, 20], { '1': 4, '2': 4, '3': 4 })]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out[0].teamHandicap).toBeCloseTo(6.5, 1)
    expect(out[0].totalNeto).toBeLessThan(out[0].totalGross)
  })

  it('usa teamHandicap almacenado (override) en vez de recalcular — consistencia con la tarjeta', () => {
    // handicaps [10,20] recalcularían 6.5, pero el override 0 → neto == gross.
    const t: ScrambleTeam = { id: 'e', nombre: 'Override', handicaps: [10, 20], scores: { '1': 4, '2': 4, '3': 4 }, teamHandicap: 0 }
    const out = computeScrambleStandings([t], HOLES, 12, 'scramble', 'neto')
    expect(out[0].teamHandicap).toBe(0)
    expect(out[0].totalNeto).toBe(out[0].totalGross)
  })
})

describe('computeFoursomeStandings', () => {
  const names: Record<string, string[]> = {
    a: ['Ana', 'Aldo'],
    b: ['Bea', 'Beto'],
  }

  it('ordena por score neto ascendente (mejor primero)', () => {
    const teams = [
      team('a', 'Águilas', [10, 12], { '1': 5, '2': 5, '3': 5 }), // gross 15
      team('b', 'Cóndores', [2, 4], { '1': 4, '2': 4, '3': 4 }),  // gross 12
    ]
    const out = computeFoursomeStandings(teams, names, HOLES, 12, 'foursome', 'neto')
    expect(out.map((t) => t.teamId)).toEqual(['b', 'a'])
    expect(out[0].holesPlayed).toBe(3)
  })

  it('handicap de equipo = (A+B)/2 redondeado', () => {
    // [10,20] → (10+20)/2 = 15
    const teams = [team('x', 'X', [10, 20], { '1': 4, '2': 4, '3': 4 })]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'neto')
    expect(out[0].teamHandicap).toBe(15)
    expect(out[0].totalNeto).toBeLessThan(out[0].totalGross)
  })

  it('equipo sin scores → holesPlayed 0, no crashea', () => {
    const teams = [team('c', 'Vacío', [10, 10], {})]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'neto')
    expect(out).toHaveLength(1)
    expect(out[0].holesPlayed).toBe(0)
  })

  it('sin memberNames usa nombres vacíos sin romper', () => {
    const teams = [team('d', 'Sin nombres', [8, 8], { '1': 4 })]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'gross')
    expect(out[0].teamId).toBe('d')
    expect(out[0].holesPlayed).toBe(1)
  })

  it('usa teamHandicap almacenado (override) en vez de recalcular — paridad con la tarjeta', () => {
    // handicaps [10,20] recalcularían (10+20)/2=15, pero el override 0 → neto == gross.
    const t: ScrambleTeam = { id: 'o', nombre: 'Override', handicaps: [10, 20], scores: { '1': 4, '2': 4, '3': 4 }, teamHandicap: 0 }
    const out = computeFoursomeStandings([t], {}, HOLES, 12, 'foursome', 'neto')
    expect(out[0].teamHandicap).toBe(0)
    expect(out[0].totalNeto).toBe(out[0].totalGross)
  })

  it('equipo con !=2 jugadores no crashea (1 y 3 índices)', () => {
    const uno = team('u', 'Uno', [12], { '1': 4 })       // foursome incompleto
    const tres = team('t3', 'Tres', [6, 10, 14], { '1': 5 }) // sobra el 3ro
    const out = computeFoursomeStandings([uno, tres], {}, HOLES, 12, 'foursome', 'gross')
    expect(out).toHaveLength(2)
    // Uno: (12+0)/2=6 ; Tres ignora el 3ro: (6+10)/2=8
    const u = out.find((x) => x.teamId === 'u')!
    const t3 = out.find((x) => x.teamId === 't3')!
    expect(u.teamHandicap).toBe(6)
    expect(t3.teamHandicap).toBe(8)
  })
})
