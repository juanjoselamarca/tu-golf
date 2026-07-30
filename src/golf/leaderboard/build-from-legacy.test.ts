// Board individual del path legacy (`players` + `rounds` + `hole_scores`) —
// el que alimenta la landing `/torneo/[slug]`.
//
// Blinda el P0 del barrido 27-jul: durante la ronda el board comparaba el score
// contra el par de la CANCHA COMPLETA y leía el neto de `rounds.total_net`.
// Resultado en torneo real: todo jugador mid-ronda salía decenas bajo par y el
// leaderboard quedaba al revés (lideraba el que menos hoyos llevaba).

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import { buildScoringHandicaps } from './scoring-handicap'
import type { CourseHole, TournamentLeaderboardContext } from './types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'

/**
 * Handicaps de scoring en modo NO-whs (índice crudo) — el comportamiento
 * histórico de los torneos existentes. Los tests que necesitan WHS lo arman
 * explícito con `buildScoringHandicaps`.
 */
function hcpsCrudos(players: DBPlayer[]) {
  return buildScoringHandicaps(
    players.map((p) => ({ id: p.id, handicap_at_registration: p.handicap_at_registration, tee_id: p.tee_id })),
    { hcp_calc_mode: 'raw', tees: null, courses: null },
    [],
    COURSE_HOLES,
    18,
  )
}

/** Atajo: corre el builder con los handicaps crudos de esos jugadores. */
function build(players: DBPlayer[], ctx = CTX, rondas = 1) {
  return buildLeaderboardFromLegacy(players, ctx, rondas, hcpsCrudos(players))
}

const COURSE_HOLES: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

const CTX: TournamentLeaderboardContext = {
  parTotal: 72,
  totalHoyos: 18,
  modoJuego: 'gross',
  formatoJuego: 'stroke_play',
  courseHoles: COURSE_HOLES,
}

/**
 * Jugador legacy con una ronda. `holes` = cuántos hoyos cargó, `gross` = golpes
 * por hoyo. `totalNet`/`totalGross` son las columnas almacenadas: por defecto
 * quedan en 0 a propósito, que es como las deja cualquier camino de entrada que
 * no sea `/api/game`.
 */
function jugador(opts: {
  id: string
  nombre?: string | null
  playerName?: string | null
  hcp?: number
  holes: number
  gross?: number
  totalNet?: number
  totalGross?: number
  status?: string
}): DBPlayer {
  const gross = opts.gross ?? 4
  return {
    id: opts.id,
    handicap_at_registration: opts.hcp ?? 0,
    player_name: opts.playerName ?? null,
    profiles: opts.nombre === undefined ? { name: 'Jugador Uno', indice: 10 } : (opts.nombre ? { name: opts.nombre, indice: 10 } : null),
    categories: null,
    rounds: [
      {
        id: `${opts.id}-r1`,
        status: opts.status ?? 'in_progress',
        total_gross: opts.totalGross ?? 0,
        total_net: opts.totalNet ?? 0,
        total_points: 0,
        round_number: 1,
        hole_scores: Array.from({ length: opts.holes }, (_, i) => ({
          hole_number: i + 1,
          gross_score: gross,
        })),
      },
    ],
  } as unknown as DBPlayer
}

describe('buildLeaderboardFromLegacy — vs par contra hoyos jugados (P0)', () => {
  it('jugador en par thru 9 marca E, no −36', () => {
    const out = build([jugador({ id: 'p1', holes: 9 })])

    expect(out.players[0].total).toBe(0)
    expect(out.players[0].holes).toBe(9)
  })

  it('el board NO queda al revés: el atrasado no lidera sobre el adelantado', () => {
    // Ambos en par. Antes, thru 3 daba −60 y thru 15 daba −12 → lideraba el thru 3.
    const atrasado = jugador({ id: 'atrasado', nombre: 'Atrasado', holes: 3 })
    const adelantado = jugador({ id: 'adelantado', nombre: 'Adelantado', holes: 15 })

    const out = build([atrasado, adelantado])

    expect(out.players.map((p) => p.total)).toEqual([0, 0])
  })

  it('el que va peor queda abajo aunque lleve más hoyos', () => {
    const bueno = jugador({ id: 'bueno', nombre: 'Bueno', holes: 18, gross: 4 })   // E
    const malo = jugador({ id: 'malo', nombre: 'Malo', holes: 9, gross: 6 })       // +18

    const out = build([bueno, malo])

    expect(out.players[0].name.startsWith('Bueno')).toBe(true)
    expect(out.players[0].total).toBe(0)
    expect(out.players[1].total).toBe(18)
  })
})

describe('buildLeaderboardFromLegacy — neto derivado, no leído de la columna', () => {
  it('con total_net en 0 el neto igual sale bien', () => {
    // hcp 18 en 18 hoyos de 5 golpes: neto real 90 − 18 = 72 → E.
    const p = jugador({ id: 'p1', hcp: 18, holes: 18, gross: 5, totalNet: 0, totalGross: 0 })
    const ctxNeto: TournamentLeaderboardContext = { ...CTX, modoJuego: 'neto' }

    const out = build([p], ctxNeto)

    expect(out.playersByNeto[0].total).toBe(0)
  })

  it('ignora un total_net almacenado que contradiga los hole_scores', () => {
    // La columna dice 60 (−12). Los hoyos dicen 72 golpes con hcp 0 → E.
    const p = jugador({ id: 'p1', hcp: 0, holes: 18, gross: 4, totalNet: 60 })
    const ctxNeto: TournamentLeaderboardContext = { ...CTX, modoJuego: 'neto' }

    const out = build([p], ctxNeto)

    expect(out.playersByNeto[0].total).toBe(0)
  })
})

describe('buildLeaderboardFromLegacy — handicap de scoring (torneos WHS)', () => {
  // Los Leones: slope 142, CR 75.1, par 72. Índice 12.0 → course handicap 18.
  const TEE_AZUL = {
    id: 'tee-azul',
    nombre: 'Azul',
    rating: 75.1,
    slope: 142,
    yardaje_total: 6300,
    genero: 'varones',
    front_course_rating: null,
    front_slope_rating: null,
    back_course_rating: null,
    back_slope_rating: null,
  }

  const TORNEO_WHS = {
    hcp_calc_mode: 'whs',
    tees: 'Azul',
    courses: { par_total: 72, slope_rating: 142, course_rating: 75.1 },
  }

  it('reparte golpes con el course handicap por tee, no con el índice crudo', () => {
    // Índice 12 → CH 18 en esta cancha. 18 hoyos de bogey (90 gross) → neto 72 = E.
    // Con el índice crudo (12) el neto daría 78 → +6, seis golpes de diferencia.
    const p = { ...jugador({ id: 'p1', hcp: 12, holes: 18, gross: 5 }), tee_id: 'tee-azul' } as DBPlayer
    const ctxNeto: TournamentLeaderboardContext = { ...CTX, modoJuego: 'neto' }

    const handicaps = buildScoringHandicaps(
      [{ id: 'p1', handicap_at_registration: 12, tee_id: 'tee-azul' }],
      TORNEO_WHS,
      [TEE_AZUL],
      COURSE_HOLES,
      18,
    )
    expect(handicaps.get('p1')).toBe(18)

    const out = buildLeaderboardFromLegacy([p], ctxNeto, 1, handicaps)

    expect(out.playersByNeto[0].total).toBe(0)
    expect(out.playersByNeto[0].netStrokes).toBe(72)
  })

  it('modo distinto de whs conserva el índice crudo (torneos históricos)', () => {
    const p = { ...jugador({ id: 'p1', hcp: 12, holes: 18, gross: 5 }), tee_id: 'tee-azul' } as DBPlayer
    const ctxNeto: TournamentLeaderboardContext = { ...CTX, modoJuego: 'neto' }

    const handicaps = buildScoringHandicaps(
      [{ id: 'p1', handicap_at_registration: 12, tee_id: 'tee-azul' }],
      { ...TORNEO_WHS, hcp_calc_mode: 'raw' },
      [TEE_AZUL],
      COURSE_HOLES,
      18,
    )
    expect(handicaps.get('p1')).toBe(12)

    const out = buildLeaderboardFromLegacy([p], ctxNeto, 1, handicaps)

    expect(out.playersByNeto[0].netStrokes).toBe(78) // 90 − 12
  })
})

describe('buildLeaderboardFromLegacy — jugador sin scorear', () => {
  it('con ronda abierta pero cero hoyos no aparece bajo par', () => {
    const sinScore = jugador({ id: 'p1', nombre: 'Sin Score', holes: 0 })

    const out = build([sinScore])

    expect(out.players[0].total).toBe(0)
    expect(out.players[0].holes).toBe(0)
  })

  it('no le gana a un jugador real que va en par', () => {
    const sinScore = jugador({ id: 'sin', nombre: 'Sin Score', holes: 0 })
    const jugando = jugador({ id: 'jug', nombre: 'Jugando', holes: 12, gross: 4 })

    const out = build([sinScore, jugando])

    // Ambos en 0: el desempate lo resuelve el countback, pero lo que NO puede
    // pasar es que el que no jugó aparezca bajo par.
    expect(out.players.every((p) => p.total >= 0)).toBe(true)
  })
})

describe('buildLeaderboardFromLegacy — nombre del jugador', () => {
  it('cae a player_name cuando el perfil no tiene nombre', () => {
    const p = jugador({ id: 'p1', nombre: null, playerName: 'Invitado Pérez', holes: 9 })

    const out = build([p])

    expect(out.players[0].name.startsWith('Invitado Pérez')).toBe(true)
  })

  it('un nombre de perfil en blanco NO deja la celda vacía', () => {
    const p = jugador({ id: 'p1', nombre: '   ', playerName: 'Respaldo', holes: 9 })

    const out = build([p])

    expect(out.players[0].name.startsWith('Respaldo')).toBe(true)
  })

  it('sin ningún nombre usable muestra "Jugador"', () => {
    const p = jugador({ id: 'p1', nombre: null, playerName: null, holes: 9 })

    const out = build([p])

    expect(out.players[0].name.startsWith('Jugador')).toBe(true)
  })
})

describe('buildLeaderboardFromLegacy — multi-ronda', () => {
  it('acumula el par de las rondas jugadas, no par de cancha × rondas', () => {
    const p = {
      id: 'p1',
      handicap_at_registration: 0,
      player_name: null,
      profiles: { name: 'Multi', indice: 5 },
      categories: null,
      rounds: [
        {
          id: 'r1', status: 'closed', total_gross: 0, total_net: 0, total_points: 0, round_number: 1,
          hole_scores: Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, gross_score: 4 })),
        },
        {
          id: 'r2', status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: 2,
          hole_scores: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, gross_score: 4 })),
        },
      ],
    } as unknown as DBPlayer

    const out = build([p], CTX, 2)

    // 27 hoyos en par → E contra 108 de par jugado (no contra 144).
    expect(out.players[0].total).toBe(0)
    expect(out.players[0].holes).toBe(27)
  })
})
