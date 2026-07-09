import { describe, it, expect } from 'vitest'
import { computeScrambleStandings, computeFoursomeStandings, computeBestBallStandings } from './team-standings'
import type { ScrambleTeam, BestBallTeam } from '@/golf/formats'

/**
 * Canario P0 (09-jul-2026) — TORNEO DE EQUIPOS 9h sobre cancha de 18 hoyos.
 *
 * En prod los torneos de 9h corren sobre canchas con `course_holes` numero 1..18,
 * y `torneo/[slug]/page.tsx` + `en-vivo` pasan las 18 filas a computeXStandings.
 * Los engines derivan `roundHoles = sortedHoles.length` = 18 → el team handicap
 * NO se divide para 9h (courseHandicapParaHoyos(H, 18) = H) y reparte ~2× golpes.
 * Además el countback del desempate (#249) ve holeCount=18 y cae al card-off.
 *
 * Norte se salva por coincidencia (su front-9 son los SI impares — split USGA),
 * pero una cancha donde el front-9 tiene los hoyos más difíciles (SI 1..9) rompe
 * fuerte. El fix: pasar `roundHoles` a computeXStandings, que filtra a los hoyos
 * del round (numero <= roundHoles) antes del engine y del ordenamiento.
 */

// Cancha 18h donde el FRONT-9 tiene los 9 hoyos MÁS DIFÍCILES (SI 1..9).
const H18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
const SCORES_PAR9 = { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 }

describe('computeScrambleStandings — roundHoles filtra a los hoyos del round (P0 9h/cancha 18h)', () => {
  // teamHandicap 6 (escala 18h). En 9h se reparte la mitad → 3 golpes. Gross 36 → neto 33.
  const team = (): ScrambleTeam => ({ id: 't', nombre: 'T', handicaps: [6, 6], scores: SCORES_PAR9, teamHandicap: 6 })

  it('con roundHoles=9 reparte 3 golpes (neto 33), no 6 (neto 30)', () => {
    const out = computeScrambleStandings([team()], H18, 36, 'scramble', 'neto', 9)[0]
    expect(out.totalGross).toBe(36)
    expect(out.totalGross - out.totalNeto).toBe(3) // == course handicap 9h
    expect(out.totalNeto).toBe(33)
  })

  it('con roundHoles=9 el result tiene 9 hoyos → el countback del desempate ve holeCount=9 (no 18)', () => {
    // team-tiebreak deriva holeCount = max(result.holes.length); si son 18, los
    // segmentos back-9/6/3/1 caen en hoyos vacíos y el desempate degrada a card-off.
    const out9 = computeScrambleStandings([team()], H18, 36, 'scramble', 'neto', 9)[0]
    const out18 = computeScrambleStandings([team()], H18, 36, 'scramble', 'neto')[0]
    expect(out9.holes.length).toBe(9)
    expect(out18.holes.length).toBe(18) // documenta el input roto sin roundHoles
  })

  it('SIN roundHoles (18 hoyos crudos) documenta el bug: reparte 6 golpes', () => {
    const out = computeScrambleStandings([team()], H18, 36, 'scramble', 'neto')[0]
    expect(out.totalGross - out.totalNeto).toBe(6) // sobre-asigna (bug histórico)
  })
})

describe('computeFoursomeStandings — roundHoles (P0 9h/cancha 18h)', () => {
  const team = (): ScrambleTeam => ({ id: 't', nombre: 'T', handicaps: [6, 6], scores: SCORES_PAR9, teamHandicap: 6 })
  it('con roundHoles=9 no sobre-asigna golpes', () => {
    const withRound = computeFoursomeStandings([team()], { t: ['A', 'B'] }, H18, 36, 'foursome', 'neto', 9)[0]
    const raw18 = computeFoursomeStandings([team()], { t: ['A', 'B'] }, H18, 36, 'foursome', 'neto')[0]
    expect(withRound.totalGross - withRound.totalNeto).toBeLessThan(raw18.totalGross - raw18.totalNeto)
  })
})

describe('computeBestBallStandings — roundHoles (P0 9h/cancha 18h)', () => {
  // best_ball: course handicap por jugador YA viene en escala 9h; el riesgo acá es
  // sólo la normalización del SI sobre 18 vs 9. Necesita front-9 con SI>9 (Norte)
  // para exponerse: con SI 18h-impares, normalizar sobre 18 es no-op y el front-9
  // conserva {15,13,3,11,9,1,17,7,5} → CH 5 sólo recibe golpe en SI≤5 (3 golpes).
  const NORTE = [15, 13, 3, 11, 9, 1, 17, 7, 5, 16, 14, 4, 12, 10, 2, 18, 8, 6]
  const H18_NORTE = NORTE.map((si, i) => ({ numero: i + 1, par: 4, stroke_index: si }))
  const team = (): BestBallTeam => ({
    id: 't', nombre: 'T',
    jugadores: [{ id: 'p', nombre: 'P', handicapIndex: 5, scores: SCORES_PAR9 }],
  })
  it('con roundHoles=9 reparte 5 golpes al único jugador (neto 31), no 3', () => {
    const out = computeBestBallStandings([team()], H18_NORTE, 36, 'best_ball', 'neto', 9)[0]
    expect(out.totalGross).toBe(36)
    expect(out.totalGross - out.totalNeto).toBe(5)
  })
})
