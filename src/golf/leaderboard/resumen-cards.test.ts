// Tests de `computeResumenCards` — las tarjetas del tab Resumen del organizador.
//
// Se testea CONTRA EL MOTOR (`buildLeaderboardFromLegacy`) con fixtures con la
// forma de la data real de prod, porque las dos mentiras que este módulo cierra
// eran de datos, no de render:
//  1. "N completos" filtraba `rounds.status === 'completed'` — valor que la
//     columna NUNCA toma (prod 2-ago-2026: in_progress=52, closed=25) → 0 fijo.
//  2. "Mejor Neto" leía `rounds[0].total_net` con guard `n !== 0` — 19 de 77
//     rondas de prod tienen la columna en 0 → "--" con el torneo jugado.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import { computeResumenCards } from './resumen-cards'
import { computeTournamentResults } from './compute-tournament-results'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { CourseHole, TournamentLeaderboardContext } from './types'

const COURSE_HOLES: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

const CTX: TournamentLeaderboardContext = {
  parTotal: 72,
  totalHoyos: 18,
  modoJuego: 'neto',
  formatoJuego: 'stroke_play',
  courseHoles: COURSE_HOLES,
  // Sin contexto de hcp → índice crudo (torneo hcp_calc_mode ≠ 'whs').
  hcp: null,
}

/** Jugador legacy con tarjeta completa de 18 hoyos y — como en prod — la
 *  columna `total_net` SIN escribir (0). */
function jugadorCerrado(id: string, nombre: string, gross18: number, hcp: number): DBPlayer {
  const porHoyo = Math.floor(gross18 / 18)
  const resto = gross18 - porHoyo * 18
  return {
    id,
    handicap_at_registration: hcp,
    player_name: null,
    profiles: { name: nombre, indice: hcp },
    categories: null,
    rounds: [
      {
        id: `r-${id}`,
        status: 'closed', // el valor REAL de prod ('completed' no existe)
        total_gross: gross18,
        total_net: 0, // columna denormalizada sin escribir (19/77 en prod)
        total_points: 0,
        round_number: 1,
        hole_scores: COURSE_HOLES.map((h) => ({
          hole_number: h.numero,
          gross_score: porHoyo + (h.numero <= resto ? 1 : 0),
        })),
      },
    ],
  }
}

function jugadorEnJuego(id: string, nombre: string, hoyos: number): DBPlayer {
  return {
    id,
    handicap_at_registration: 12,
    player_name: null,
    profiles: { name: nombre, indice: 12 },
    categories: null,
    rounds: [
      {
        id: `r-${id}`,
        status: 'in_progress',
        total_gross: 0,
        total_net: 0,
        total_points: 0,
        round_number: 1,
        hole_scores: Array.from({ length: hoyos }, (_, i) => ({
          hole_number: i + 1,
          gross_score: 5,
        })),
      },
    ],
  }
}

function jugadorSinRonda(id: string, nombre: string): DBPlayer {
  return {
    id,
    handicap_at_registration: 20,
    player_name: nombre,
    profiles: null,
    categories: null,
    rounds: [],
  }
}

function cardsDe(dbPlayers: DBPlayer[]) {
  const out = buildLeaderboardFromLegacy(dbPlayers, CTX, 1)
  return {
    out,
    cards: computeResumenCards(out.players, out.playersByGross, out.playersByNeto, CTX.parTotal),
  }
}

describe('computeResumenCards — las dos mentiras de prod', () => {
  it('cuenta completos con status "closed" (el string "completed" no existe en prod)', () => {
    const { cards } = cardsDe([
      jugadorCerrado('a', 'Ana Silva', 85, 10),
      jugadorCerrado('b', 'Beto Rojas', 80, 2),
      jugadorEnJuego('c', 'Caro Díaz', 9),
    ])
    expect(cards.completos).toBe(2)
    expect(cards.conScore).toBe(3)
    expect(cards.totalJugadores).toBe(3)
  })

  it('Mejor Neto sale del motor aunque total_net esté en 0 en la BD', () => {
    const { cards } = cardsDe([
      jugadorCerrado('a', 'Ana Silva', 85, 10), // neto 75
      jugadorCerrado('b', 'Beto Rojas', 80, 2), // neto 78
    ])
    // La lógica vieja (guard `n !== 0` sobre la columna) rendía "--" acá.
    expect(cards.mejorNeto).toMatchObject({ name: 'Ana Silva', score: 75, enCurso: false })
    expect(cards.mejorGross).toMatchObject({ name: 'Beto Rojas', score: 80, enCurso: false })
  })

  it('ronda cerrada SOLO con totales (sin hole_scores): neto derivado gross − hcp, no "--"', () => {
    const soloTotales: DBPlayer = {
      ...jugadorCerrado('a', 'Ana Silva', 85, 10),
      rounds: [
        {
          id: 'r-a',
          status: 'closed',
          total_gross: 85,
          total_net: 0, // el caso exacto de las 19/77 rondas de prod
          total_points: 0,
          round_number: 1,
          hole_scores: [],
        },
      ],
    }
    const { cards } = cardsDe([soloTotales])
    expect(cards.completos).toBe(1)
    expect(cards.mejorNeto).toMatchObject({ name: 'Ana Silva', score: 75, enCurso: false })
  })
})

describe('computeResumenCards — porteros canónicos', () => {
  it('una vuelta a medias NO es "completo", pero SÍ es líder parcial etiquetado', () => {
    const { cards } = cardsDe([jugadorEnJuego('c', 'Caro Díaz', 9)])
    expect(cards.completos).toBe(0)
    expect(cards.conScore).toBe(1)
    // Decisión de producto (2-ago-2026): el organizador ve la señal mientras se
    // juega, marcada `enCurso` y con el thru. No cuenta como "completo".
    expect(cards.completos).toBe(0)
    expect(cards.mejorGross?.enCurso).toBe(true)
    expect(cards.mejorNeto?.enCurso).toBe(true)
    expect(cards.mejorGross?.thru).toBeGreaterThan(0)
  })

  it('el inscrito sin ronda cuenta en el total pero no en conScore', () => {
    const { cards } = cardsDe([jugadorCerrado('a', 'Ana Silva', 85, 10), jugadorSinRonda('d', 'Dani Pino')])
    expect(cards.totalJugadores).toBe(2)
    expect(cards.conScore).toBe(1)
  })

  it('los números son LITERALMENTE los del podio del board público', () => {
    const { out, cards } = cardsDe([
      jugadorCerrado('a', 'Ana Silva', 85, 10),
      jugadorCerrado('b', 'Beto Rojas', 80, 2),
      jugadorEnJuego('c', 'Caro Díaz', 9),
    ])
    const podio = computeTournamentResults(out.playersByGross, out.playersByNeto, CTX.parTotal, null)
    // Con tarjetas terminadas, el Resumen muestra LITERALMENTE el podio público.
    expect(cards.mejorGross).toMatchObject({ ...podio!.grossWinner!, enCurso: false })
    expect(cards.mejorNeto).toMatchObject({ ...podio!.netoWinner!, enCurso: false })
  })
})
