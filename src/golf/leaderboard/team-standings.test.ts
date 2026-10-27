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

function team(id: string, nombre: string, teamHandicap: number, scores: Record<string, number>): ScrambleTeam {
  return { id, nombre, teamHandicap, scores }
}

describe('computeScrambleStandings', () => {
  it('ordena por score neto ascendente (mejor primero)', () => {
    const teams = [
      team('a', 'Águilas', 5, { '1': 5, '2': 5, '3': 5 }), // gross 15
      team('b', 'Cóndores', 1, { '1': 4, '2': 4, '3': 4 }),  // gross 12
    ]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out.map((t) => t.teamId)).toEqual(['b', 'a'])
    expect(out[0].holesPlayed).toBe(3)
  })

  it('equipo sin scores → holesPlayed 0, no crashea', () => {
    const teams = [team('c', 'Vacío', 10, {})]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out).toHaveLength(1)
    expect(out[0].holesPlayed).toBe(0)
  })

  it('aplica el handicap de equipo guardado: reduce el neto', () => {
    const teams = [team('d', 'X', 7, { '1': 4, '2': 4, '3': 4 })]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out[0].teamHandicap).toBe(7)
    expect(out[0].totalNeto).toBeLessThan(out[0].totalGross)
  })

  it('handicap guardado 0 → neto == gross (consistencia con la tarjeta)', () => {
    const t: ScrambleTeam = { id: 'e', nombre: 'Override', scores: { '1': 4, '2': 4, '3': 4 }, teamHandicap: 0 }
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
      team('a', 'Águilas', 11, { '1': 5, '2': 5, '3': 5 }), // gross 15
      team('b', 'Cóndores', 3, { '1': 4, '2': 4, '3': 4 }),  // gross 12
    ]
    const out = computeFoursomeStandings(teams, names, HOLES, 12, 'foursome', 'neto')
    // HOLES tiene 3 hoyos (≤9) → el team handicap se reparte a la mitad (WHS 9h),
    // consistente con el scorer individual. a hcp 11→6 (2/hoyo)=6 strokes
    // →neto 9; b hcp 3→2→2 strokes→neto 10. Gana 'a'.
    expect(out.map((t) => t.teamId)).toEqual(['a', 'b'])
    expect(out[0].holesPlayed).toBe(3)
  })

  it('aplica el handicap de equipo guardado', () => {
    const teams = [team('x', 'X', 15, { '1': 4, '2': 4, '3': 4 })]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'neto')
    expect(out[0].teamHandicap).toBe(15)
    expect(out[0].totalNeto).toBeLessThan(out[0].totalGross)
  })

  it('equipo sin scores → holesPlayed 0, no crashea', () => {
    const teams = [team('c', 'Vacío', 10, {})]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'neto')
    expect(out).toHaveLength(1)
    expect(out[0].holesPlayed).toBe(0)
  })

  it('sin memberNames usa nombres vacíos sin romper', () => {
    const teams = [team('d', 'Sin nombres', 8, { '1': 4 })]
    const out = computeFoursomeStandings(teams, {}, HOLES, 12, 'foursome', 'gross')
    expect(out[0].teamId).toBe('d')
    expect(out[0].holesPlayed).toBe(1)
  })

  it('handicap guardado 0 → neto == gross (paridad con la tarjeta)', () => {
    const t: ScrambleTeam = { id: 'o', nombre: 'Override', scores: { '1': 4, '2': 4, '3': 4 }, teamHandicap: 0 }
    const out = computeFoursomeStandings([t], {}, HOLES, 12, 'foursome', 'neto')
    expect(out[0].teamHandicap).toBe(0)
    expect(out[0].totalNeto).toBe(out[0].totalGross)
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

  // ── P0 (07-jul-2026): SI 18h-impar en ronda de 9h sub-asignaba golpes ──────
  //    Mismo bug "net +12 Don Jorge" que scramble/foursome (#245) e individual
  //    (#244). best_ball pasaba stroke_index CRUDO y sin roundHoles → maxSI=18 →
  //    un CH de 5 sobre SI {15,13,3,11,9,1,17,7,5} sólo recibía golpe donde SI≤5
  //    (3 golpes) en vez de en los 5 hoyos más difíciles. Datos reales del
  //    recorrido "Norte" (Brisas de Santo Domingo, migración 019).
  describe('SI 9h normalización (P0 Norte)', () => {
    // 9 hoyos par 4, SI reales de Norte: escala 18h, impares, NO permutación 1..9.
    const NORTE_SI = [15, 13, 3, 11, 9, 1, 17, 7, 5]
    const HOLES_9 = NORTE_SI.map((si, i) => ({ numero: i + 1, par: 4, stroke_index: si }))
    const strokeIndexByHole9 = Object.fromEntries(HOLES_9.map((h) => [h.numero, h.stroke_index]))
    const parMap9 = Object.fromEntries(HOLES_9.map((h) => [h.numero, h.par]))

    it('INVARIANTE: Σ golpes de hándicap == course handicap 9h (equipo de 1 jugador)', () => {
      // Equipo de 1 jugador con CH 9h = 5, todos los hoyos en par (gross 36).
      // El neto del equipo = gross de su único jugador − golpes recibidos.
      // Σ golpes DEBE ser 5 (los 5 hoyos más difíciles), no 3.
      const solo = bbTeam('solo', 'Solo', [
        { id: 'p', nombre: 'P', courseHcp: 5, scores: Object.fromEntries(HOLES_9.map((h) => [String(h.numero), 4])) },
      ])
      const board = computeBestBallStandings([solo], HOLES_9, 36, 'best_ball', 'neto')[0]
      expect(board.totalGross).toBe(36)
      expect(board.totalGross - board.totalNeto).toBe(5) // == course handicap 9h
      expect(board.overUnderNeto).toBe(-5)
    })

    it('paridad bajo SI corrupto: board ≡ calcBestBallTotals del scorer (9h Norte)', () => {
      const solo = bbTeam('solo', 'Solo', [
        { id: 'p', nombre: 'P', courseHcp: 5, scores: Object.fromEntries(HOLES_9.map((h) => [String(h.numero), 4])) },
      ])
      const board = computeBestBallStandings([solo], HOLES_9, 36, 'best_ball', 'neto')[0]
      const scorer = calcBestBallTotals({
        equipoJugadorIds: ['p'],
        totalHoles: 9,
        scores: { p: Object.fromEntries(HOLES_9.map((h) => [h.numero, 4])) },
        modoJuego: 'neto',
        playerDotHcps: { p: 5 },
        strokeIndexByHole: strokeIndexByHole9,
        parMap: parMap9,
      })
      expect(board.totalNeto).toBe(scorer.total)
      expect(board.overUnderNeto).toBe(scorer.vsPar)
    })
  })
})
