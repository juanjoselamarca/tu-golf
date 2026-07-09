import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromRondaLibre } from '../golf/leaderboard/build-from-ronda-libre'
import type { TournamentLeaderboardContext } from '../golf/leaderboard/types'
import type { DBRondaLibreJugador } from '../app/torneo/[slug]/types'

/**
 * Canario P0 (07-jul-2026) — path INDIVIDUAL del board de torneo.
 *
 * Gemelo del canario de equipos (`team-standings-si-norm.test.ts`) pero contra el
 * motor del leaderboard INDIVIDUAL (`buildLeaderboardFromRondaLibre`), que es el que
 * arma la tabla de un torneo stroke_play/stableford a partir de rondas libres.
 *
 * Escenario: neto · 9h en una cancha con stroke_index de escala 18h (impares
 * 1..17), NO permutación 1..9. Caso real: recorrido "Norte" de Brisas de Santo
 * Domingo, SI por hoyo = 15,13,3,11,9,1,17,7,5.
 *
 * Invariante WHS: la suma de golpes de hándicap alocados en la ronda DEBE igualar
 * el course handicap 9h de la ronda. Con SI sin normalizar, el motor sólo daba
 * golpe donde `si <= courseHandicap` y como los SI son 18h-impares se perdían
 * golpes en silencio → el neto salía MEJOR de lo correcto (menos golpes de los
 * que corresponden). Con course handicap 9h = 5, sólo repartía 3 (SI 1,3,5) en
 * vez de 5.
 */

// SI reales pre-migración de Norte (18h-impares). Par 4 en todos: irrelevante para
// la alocación (depende sólo de course handicap × SI × roundHoles) y suma 36.
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

// Course handicap 9h = 5. Juega todos los hoyos en par (gross 36).
const JUGADOR: DBRondaLibreJugador = {
  id: 'jug-1',
  nombre: 'Padre',
  user_id: null,
  handicap: 5,
  handicap_index: 10,
  tees: null,
  ronda_id: 'r1',
  scores: { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 },
}

const CTX_9H: TournamentLeaderboardContext = {
  parTotal: PAR_9,
  totalHoyos: 9,
  modoJuego: 'neto',
  formatoJuego: 'stroke_play',
  courseHoles: HOLES_NORTE_9,
}

describe('buildLeaderboardFromRondaLibre — SI 18h en 9h no pierde golpes (P0 Norte individual)', () => {
  it('course handicap 9h=5 → reparte 5 golpes (net -5), no 3 (net -3)', () => {
    const out = buildLeaderboardFromRondaLibre([JUGADOR], CTX_9H)
    const neto = out.playersByNeto[0]
    // Invariante: 36 gross - 5 golpes = 31 neto → -5 vs par (no -3).
    expect(neto.total).toBe(-5)
  })

  it('GWI neto usa el course handicap completo (overUnderNeto = -5)', () => {
    const out = buildLeaderboardFromRondaLibre([JUGADOR], CTX_9H)
    // El GWI live tracker usa el mismo neto: -5 vs par, no -3.
    expect(out.gwiInputs[0].currentScore).toBe(-5)
  })

  it('18h con SI permutación válida = comportamiento intacto (no-op)', () => {
    // Cancha 18h estándar, SI 1..18 válido, course handicap 18h = 9.
    const holes18 = Array.from({ length: 18 }, (_, i) => ({
      numero: i + 1,
      par: 4,
      stroke_index: i + 1,
    }))
    const jug18: DBRondaLibreJugador = {
      id: 'j18',
      nombre: 'Test18',
      user_id: null,
      handicap: 9,
      handicap_index: 9,
      tees: null,
      ronda_id: 'r1',
      scores: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4])),
    }
    const ctx18: TournamentLeaderboardContext = {
      parTotal: 72,
      totalHoyos: 18,
      modoJuego: 'neto',
      formatoJuego: 'stroke_play',
      courseHoles: holes18,
    }
    const out = buildLeaderboardFromRondaLibre([jug18], ctx18)
    // 72 gross - 9 golpes = 63 neto → -9 vs par.
    expect(out.playersByNeto[0].total).toBe(-9)
  })

  // ── PRODUCCIÓN REAL: torneo 9h sobre cancha de 18 hoyos ────────────────────
  //    courseHoles trae las 18 filas del recorrido (verificado en prod: los
  //    torneos de 9h corren sobre canchas con course_holes numero 1..18). Si la
  //    normalización rankea sobre las 18, un SI ya válido 1..18 es no-op y el
  //    front-9 conserva valores esparcidos → el 9h sigue perdiendo golpes. La
  //    normalización DEBE rankear sólo sobre los `totalHoyos` del round.
  it('9h sobre cancha de 18 hoyos: rankea sólo el front-9 → reparte 5 golpes (net -5)', () => {
    const FRONT = [15, 13, 3, 11, 9, 1, 17, 7, 5] // Norte
    const BACK = [16, 14, 4, 12, 10, 2, 18, 8, 6]
    const holes18 = [...FRONT, ...BACK].map((si, i) => ({ numero: i + 1, par: 4, stroke_index: si }))
    const jugador: DBRondaLibreJugador = {
      id: 'jt', nombre: 'Padre', user_id: null, handicap: 5, handicap_index: 10,
      tees: null, ronda_id: 'r1',
      scores: { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 },
    }
    const ctx: TournamentLeaderboardContext = {
      parTotal: 36, totalHoyos: 9, modoJuego: 'neto', formatoJuego: 'stroke_play', courseHoles: holes18,
    }
    const out = buildLeaderboardFromRondaLibre([jugador], ctx)
    expect(out.playersByNeto[0].total).toBe(-5)
    expect(out.gwiInputs[0].currentScore).toBe(-5)
  })
})
