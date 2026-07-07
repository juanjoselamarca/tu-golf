import { describe, it, expect } from 'vitest'
import {
  computeScrambleStandings,
  computeFoursomeStandings,
} from '../golf/leaderboard/team-standings'
import type { ScrambleTeam } from '../golf/formats/scramble'

/**
 * Canario P0 (07-jul-2026): scramble/foursome · neto · 9h en una cancha con
 * stroke_index de escala 18h (impares 1..17), NO permutación 1..9. Caso real:
 * recorrido "Norte" de Brisas de Santo Domingo (migración 019),
 * SI por hoyo = 15,13,3,11,9,1,17,7,5.
 *
 * Invariante WHS: la suma de golpes de hándicap alocados en la ronda DEBE igualar
 * el course handicap de la ronda (aquí 9h). Con SI sin normalizar, el motor sólo
 * daba golpe donde `si <= courseHandicap`, y como los SI son 18h-impares, se
 * perdían golpes en silencio → el neto del equipo salía peor de lo correcto.
 *
 * Corre contra el MOTOR REAL DEL BOARD (`computeScrambleStandings` /
 * `computeFoursomeStandings`), no contra un path individual, que es donde vivía el gap.
 */

// SI reales de Norte (18h-impares). Par 4 en todos: irrelevante para la alocación
// de golpes (depende sólo de course handicap × SI × roundHoles) y suma 36 = par de Norte.
const HOLES_NORTE_9 = [
  { numero: 1, par: 4, stroke_index: 15 },
  { numero: 2, par: 4, stroke_index: 13 },
  { numero: 3, par: 4, stroke_index: 3 },
  { numero: 4, par: 4, stroke_index: 11 },
  { numero: 5, par: 4, stroke_index: 9 },
  { numero: 6, par: 4, stroke_index: 1 },
  { numero: 7, par: 4, stroke_index: 17 },
  { numero: 8, par: 4, stroke_index: 7 },
  { numero: 9, par: 4, stroke_index: 5 },
]
const PAR_9 = 36
// teamHandicap 18h = 10 → courseHandicapParaHoyos(10, 9) = round(5) = 5.
// La pareja juega todos los hoyos en par (gross 36).
const PAREJA_PAR: ScrambleTeam = {
  id: 'pareja-1',
  nombre: 'Padre e Hijo',
  handicaps: [12, 20],
  teamHandicap: 10, // override almacenado (paridad board↔tarjeta)
  scores: { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 },
}

describe('computeScrambleStandings — SI 18h en 9h no pierde golpes (P0 Norte)', () => {
  it('team handicap 18h=10 → 9h reparte 5 golpes (uno por hoyo más difícil), no 3', () => {
    const [result] = computeScrambleStandings([PAREJA_PAR], HOLES_NORTE_9, PAR_9, 'scramble', 'neto')

    const totalStrokes = result.holes.reduce((s, h) => s + h.strokesRecibidos, 0)

    // Invariante: golpes alocados == course handicap 9h.
    expect(totalStrokes).toBe(5)
    // Board neto: 36 gross - 5 golpes = 31 neto → -5 vs par.
    expect(result.overUnderNeto).toBe(-5)
  })
})

describe('computeFoursomeStandings — SI 18h en 9h no pierde golpes (P0 Norte)', () => {
  it('team handicap 18h=10 → 9h reparte 5 golpes, no 3', () => {
    const [result] = computeFoursomeStandings(
      [PAREJA_PAR], {}, HOLES_NORTE_9, PAR_9, 'foursome', 'neto',
    )

    const totalStrokes = result.holes.reduce((s, h) => s + h.strokesRecibidos, 0)

    expect(totalStrokes).toBe(5)
    expect(result.overUnderNeto).toBe(-5)
  })
})
