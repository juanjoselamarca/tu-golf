import { describe, it, expect } from 'vitest'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from './team-standings'
import type { ScrambleTeam, BestBallTeam } from '@/golf/formats'
import { calcBestBallTotals } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScorecard'

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
    // HOLES tiene 3 hoyos (≤9) → el team handicap se reparte a la mitad (WHS 9h),
    // consistente con el scorer individual. a [10,12]→hcp 11→6 (2/hoyo)=6 strokes
    // →neto 9; b [2,4]→hcp 3→2→2 strokes→neto 10. Gana 'a'.
    expect(out.map((t) => t.teamId)).toEqual(['a', 'b'])
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

describe('computeBestBallStandings', () => {
  // handicapIndex aquí es el COURSE HANDICAP (golpes), igual que en producción.
  function bbTeam(
    id: string,
    nombre: string,
    jugadores: Array<{ id: string; nombre: string; courseHcp: number; scores: Record<string, number> }>,
  ): BestBallTeam {
    return {
      id,
      nombre,
      jugadores: jugadores.map((j) => ({
        id: j.id,
        nombre: j.nombre,
        handicapIndex: j.courseHcp,
        scores: j.scores,
      })),
    }
  }

  // Equipo: A scratch (0), B course hcp 3. Par 4 ×3, SI 1/2/3.
  const A = { id: 'a', nombre: 'Ana', courseHcp: 0, scores: { '1': 4, '2': 5, '3': 4 } }
  const B = { id: 'b', nombre: 'Beto', courseHcp: 3, scores: { '1': 5, '2': 4, '3': 6 } }

  it('neto: mejor bola neta por hoyo, vs par sobre hoyos jugados', () => {
    const out = computeBestBallStandings([bbTeam('e1', 'Equipo 1', [A, B])], HOLES, 12, 'best_ball', 'neto')
    expect(out).toHaveLength(1)
    // Hoyo1 net: A 4 / B 4 → 4 ; Hoyo2 net: A 5 / B 3 → 3 ; Hoyo3 net: A 4 / B 5 → 4. Total 11, vs par -1.
    expect(out[0].totalNeto).toBe(11)
    expect(out[0].overUnderNeto).toBe(-1)
    expect(out[0].holesPlayed).toBe(3)
  })

  it('gross: mejor bola gross por hoyo', () => {
    const out = computeBestBallStandings([bbTeam('e1', 'Equipo 1', [A, B])], HOLES, 12, 'best_ball', 'gross')
    // gross best: 4,4,4 → 12, vs par 0.
    expect(out[0].totalGross).toBe(12)
    expect(out[0].overUnderGross).toBe(0)
  })

  it('ordena por menor over/under (neto)', () => {
    const peor = bbTeam('peor', 'Peor', [{ id: 'x', nombre: 'X', courseHcp: 0, scores: { '1': 6, '2': 6, '3': 6 } }])
    const mejor = bbTeam('mejor', 'Mejor', [{ id: 'y', nombre: 'Y', courseHcp: 0, scores: { '1': 3, '2': 3, '3': 3 } }])
    const out = computeBestBallStandings([peor, mejor], HOLES, 12, 'best_ball', 'neto')
    expect(out[0].teamId).toBe('mejor')
    expect(out[1].teamId).toBe('peor')
  })

  it('equipo sin scores → holesPlayed 0 sin crashear', () => {
    const out = computeBestBallStandings([bbTeam('vacio', 'Vacío', [{ id: 'z', nombre: 'Z', courseHcp: 10, scores: {} }])], HOLES, 12, 'best_ball', 'neto')
    expect(out[0].holesPlayed).toBe(0)
    expect(out[0].totalNeto).toBe(0)
  })

  // ── PARIDAD CERO FALLOS: el board (motor) debe dar el MISMO total/vsPar que la
  //    tarjeta en cancha (calcBestBallTotals del scorer), con los mismos inputs. ──
  it('paridad neto: computeBestBallStandings ≡ calcBestBallTotals del scorer', () => {
    const team = bbTeam('e1', 'Equipo 1', [A, B])
    const board = computeBestBallStandings([team], HOLES, 12, 'best_ball', 'neto')[0]

    const scorer = calcBestBallTotals({
      equipoJugadorIds: [A.id, B.id],
      totalHoles: 3,
      scores: {
        [A.id]: { 1: A.scores['1'], 2: A.scores['2'], 3: A.scores['3'] },
        [B.id]: { 1: B.scores['1'], 2: B.scores['2'], 3: B.scores['3'] },
      },
      modoJuego: 'neto',
      playerDotHcps: { [A.id]: A.courseHcp, [B.id]: B.courseHcp },
      strokeIndexByHole: { 1: 1, 2: 2, 3: 3 },
      parMap: { 1: 4, 2: 4, 3: 4 },
    })

    expect(board.totalNeto).toBe(scorer.total)
    expect(board.overUnderNeto).toBe(scorer.vsPar)
    expect(board.holesPlayed).toBe(scorer.played)
  })

  it('paridad gross: computeBestBallStandings ≡ calcBestBallTotals del scorer', () => {
    const team = bbTeam('e1', 'Equipo 1', [A, B])
    const board = computeBestBallStandings([team], HOLES, 12, 'best_ball', 'gross')[0]

    const scorer = calcBestBallTotals({
      equipoJugadorIds: [A.id, B.id],
      totalHoles: 3,
      scores: {
        [A.id]: { 1: A.scores['1'], 2: A.scores['2'], 3: A.scores['3'] },
        [B.id]: { 1: B.scores['1'], 2: B.scores['2'], 3: B.scores['3'] },
      },
      modoJuego: 'gross',
      playerDotHcps: { [A.id]: A.courseHcp, [B.id]: B.courseHcp },
      strokeIndexByHole: { 1: 1, 2: 2, 3: 3 },
      parMap: { 1: 4, 2: 4, 3: 4 },
    })

    expect(board.totalGross).toBe(scorer.total)
    expect(board.overUnderGross).toBe(scorer.vsPar)
  })
})
