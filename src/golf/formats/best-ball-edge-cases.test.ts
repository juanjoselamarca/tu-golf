/**
 * Edge cases de best_ball END-TO-END (board del campeonato ↔ tarjeta en cancha).
 *
 * El invariante CERO FALLOS: para CUALQUIER escenario, el neto/gross que muestra el
 * leaderboard público (motor `calcularBestBall` vía `computeBestBallStandings`) debe
 * coincidir EXACTO con el de la tarjeta en cancha (`calcBestBallTotals` del scorer).
 * Este suite barre los casos raros que pueden aparecer en un torneo real: hoyos
 * asimétricos, ronda parcial, 3-4 jugadores, hándicap plus, tee distinto por
 * compañero (course handicaps distintos), empates, cancha sin CR (hcp entero),
 * miembro sin scores. En cada uno se corre por AMBOS caminos y se compara.
 */
import { describe, it, expect } from 'vitest'
import { computeBestBallStandings } from '@/golf/leaderboard/team-standings'
import { calcBestBallTotals } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScorecard'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import type { BestBallTeam, BestBallTeamResult } from '@/golf/formats'

interface Player { id: string; nombre: string; courseHcp: number; scores: Record<string, number> }
type Hole = { numero: number; par: number; stroke_index: number }

/** N hoyos par-4, stroke index = nº de hoyo. */
function par4Holes(n: number): Hole[] {
  return Array.from({ length: n }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
}

/** Corre el MISMO escenario por el motor (board) y por el scorer (tarjeta). */
function runBoth(players: Player[], holes: Hole[], modo: 'gross' | 'neto') {
  const parTotal = holes.reduce((s, h) => s + h.par, 0)
  const team: BestBallTeam = {
    id: 'e1', nombre: 'E1',
    jugadores: players.map((p) => ({ id: p.id, nombre: p.nombre, handicapIndex: p.courseHcp, scores: p.scores })),
  }
  const board: BestBallTeamResult = computeBestBallStandings([team], holes, parTotal, 'best_ball', modo)[0]

  const scorerScores: Record<string, Record<number, number>> = {}
  const playerDotHcps: Record<string, number> = {}
  const strokeIndexByHole: Record<number, number> = {}
  const parMap: Record<number, number> = {}
  for (const h of holes) { strokeIndexByHole[h.numero] = h.stroke_index; parMap[h.numero] = h.par }
  for (const p of players) {
    playerDotHcps[p.id] = p.courseHcp
    const s: Record<number, number> = {}
    for (const [k, v] of Object.entries(p.scores)) s[Number(k)] = v
    scorerScores[p.id] = s
  }
  const totalHoles = Math.max(...holes.map((h) => h.numero))
  const scorer = calcBestBallTotals({
    equipoJugadorIds: players.map((p) => p.id),
    totalHoles, scores: scorerScores, modoJuego: modo,
    playerDotHcps, strokeIndexByHole, parMap,
  })
  return { board, scorer }
}

/** El invariante: board == tarjeta (total, vs par, thru). */
function expectParity(board: BestBallTeamResult, scorer: { total: number; vsPar: number; played: number }, modo: 'gross' | 'neto') {
  expect(modo === 'neto' ? board.totalNeto : board.totalGross).toBe(scorer.total)
  expect(modo === 'neto' ? board.overUnderNeto : board.overUnderGross).toBe(scorer.vsPar)
  expect(board.holesPlayed).toBe(scorer.played)
}

describe('best_ball edge cases — paridad board ↔ tarjeta', () => {
  it('hoyo asimétrico: un jugador anota, el otro no (mismo hoyo)', () => {
    const holes = par4Holes(3)
    // A anota hoyos 1 y 2; B anota hoyos 2 y 3. Hoyo1 solo A, hoyo3 solo B, hoyo2 ambos.
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 0, scores: { '1': 4, '2': 5 } }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 0, scores: { '2': 4, '3': 6 } }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    // thru = 3 (los 3 hoyos tienen al menos un score). Mejor por hoyo: 4 (A), 4 (B), 6 (B) = 14.
    expect(board.holesPlayed).toBe(3)
    expect(board.totalNeto).toBe(14)
  })

  it('ronda parcial: solo 5 de 18 hoyos jugados', () => {
    const holes = par4Holes(18)
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 8, scores: { '1': 4, '2': 5, '3': 4, '4': 6, '5': 4 } }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 14, scores: { '1': 5, '2': 4, '3': 5, '4': 5, '5': 6 } }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.holesPlayed).toBe(5)
  })

  it('equipo de 3 jugadores', () => {
    const holes = par4Holes(9)
    const players: Player[] = [
      { id: 'a', nombre: 'A', courseHcp: 5, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 4])) },
      { id: 'b', nombre: 'B', courseHcp: 12, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) },
      { id: 'c', nombre: 'C', courseHcp: 20, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 6])) },
    ]
    const { board, scorer } = runBoth(players, holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.holesPlayed).toBe(9)
  })

  it('equipo de 4 jugadores (four-ball completo)', () => {
    const holes = par4Holes(9)
    const players: Player[] = [0, 1, 2, 3].map((i) => ({
      id: `p${i}`, nombre: `P${i}`, courseHcp: [2, 9, 15, 24][i],
      scores: Object.fromEntries(holes.map((h) => [String(h.numero), 4 + (i % 2)])),
    }))
    const { board, scorer } = runBoth(players, holes, 'neto')
    expectParity(board, scorer, 'neto')
    const g = runBoth(players, holes, 'gross')
    expectParity(g.board, g.scorer, 'gross')
  })

  it('hándicap plus: jugador devuelve golpes (net = gross + 1 en hoyos fáciles)', () => {
    const holes = par4Holes(18)
    // A es +2: devuelve golpe en SI 18 y 17 (los más fáciles). Net en SI18 = gross + 1.
    const A: Player = { id: 'a', nombre: 'A+', courseHcp: -2, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 4])) }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 10, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    // Sanity de golf: en SI 18, el plus devuelve un golpe → strokes = -1 → su net = 4 - (-1) = 5.
    expect(strokesRecibidosEnHoyo(-2, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 1)).toBe(0) // en el hoyo difícil no devuelve
  })

  it('tee distinto por compañero: course handicaps distintos (tee-por-jugador)', () => {
    const holes = par4Holes(9)
    // Mismos gross, pero A juega tee atrás (hcp 18) y B adelante (hcp 6). El neto cambia por jugador.
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 18, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 6, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    // gross idéntico → en modo gross el equipo da 5 por hoyo; en neto el de hcp 18 recibe más golpes.
    const g = runBoth([A, B], holes, 'gross')
    expectParity(g.board, g.scorer, 'gross')
    expect(g.board.totalGross).toBe(45) // 9 × 5
    expect(board.totalNeto).toBeLessThan(g.board.totalGross) // el neto baja por los golpes recibidos
  })

  it('empate en un hoyo: ambos jugadores mismo gross y net', () => {
    const holes = par4Holes(3)
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 0, scores: { '1': 4, '2': 4, '3': 4 } }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 0, scores: { '1': 4, '2': 4, '3': 4 } }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.totalNeto).toBe(12)
  })

  it('cancha sin CR: course handicap entero (fallback round(index)) — paridad se mantiene', () => {
    const holes = par4Holes(9)
    // Sin datos de cancha, fetchBestBallTeams alimenta round(index): valores enteros directos.
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 11, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 3, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 4])) }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
  })

  it('un solo hoyo jugado', () => {
    const holes = par4Holes(18)
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 7, scores: { '1': 3 } }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 7, scores: {} }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.holesPlayed).toBe(1)
  })

  it('un miembro sin ningún score: el equipo usa al que sí jugó', () => {
    const holes = par4Holes(9)
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 10, scores: Object.fromEntries(holes.map((h) => [String(h.numero), 5])) }
    const B: Player = { id: 'b', nombre: 'B (no jugó)', courseHcp: 10, scores: {} }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.holesPlayed).toBe(9) // A jugó los 9
  })

  it('equipo entero sin scores: holesPlayed 0, sin crashear', () => {
    const holes = par4Holes(18)
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 12, scores: {} }
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 8, scores: {} }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    expect(board.holesPlayed).toBe(0)
    expect(board.totalNeto).toBe(0)
    expect(board.overUnderNeto).toBe(0)
  })

  it('hoyos con par distinto (par 3 / 4 / 5): vs par correcto', () => {
    const holes: Hole[] = [
      { numero: 1, par: 3, stroke_index: 9 },
      { numero: 2, par: 5, stroke_index: 1 },
      { numero: 3, par: 4, stroke_index: 5 },
    ]
    const A: Player = { id: 'a', nombre: 'A', courseHcp: 0, scores: { '1': 3, '2': 5, '3': 4 } } // todo par
    const B: Player = { id: 'b', nombre: 'B', courseHcp: 0, scores: { '1': 4, '2': 6, '3': 5 } }
    const { board, scorer } = runBoth([A, B], holes, 'neto')
    expectParity(board, scorer, 'neto')
    // Mejor bola = A en los 3 → total 12, par jugado 12, vs par 0.
    expect(board.totalNeto).toBe(12)
    expect(board.overUnderNeto).toBe(0)
  })
})
