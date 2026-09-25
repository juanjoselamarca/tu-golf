// Torneo multi-ronda con una cancha DISTINTA por ronda (decisión PM
// 25-sep-2026). Fija que cada ronda se puntúa con SU cancha: su par, su stroke
// index y su course handicap (WHS: el course handicap depende del slope/CR/par
// de la cancha en que se juega). Antes el motor usaba la cancha de la ronda 1
// para todas las rondas.
//
// Números reales de dos canchas del catálogo:
//   · Ronda 1 — Las Brisas Norte-Sur (VARONES): par 72, tee azul slope 132 / CR 71.9
//   · Ronda 2 — Club de Golf Los Leones: par 72, tee azul slope 142 / CR 75.1
// Un índice 12 recibe 14 golpes en Brisas y 18 en Los Leones — cuatro golpes
// de diferencia en la MISMA vuelta según dónde se juegue.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import type {
  CourseHole,
  LegacyHcpContext,
  RoundLeaderboardContext,
  TournamentLeaderboardContext,
} from './types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'

const HOLES_BRISAS: CourseHole[] = [4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 3, 5, 4].map((par, i) => ({
  numero: i + 1,
  par,
  stroke_index: [15, 13, 3, 11, 9, 1, 17, 7, 5, 16, 2, 6, 12, 10, 14, 18, 4, 8][i],
}))
// Los Leones: mismo par 72 pero otra distribución de SI (par 5 en el 1 y el 18).
const HOLES_LEONES: CourseHole[] = [5, 4, 4, 3, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5].map((par, i) => ({
  numero: i + 1,
  par,
  stroke_index: [7, 3, 1, 15, 9, 5, 17, 11, 13, 4, 18, 2, 8, 10, 6, 16, 12, 14][i],
}))

const TEE_BRISAS: CourseTeeRow = {
  id: 'tee-brisas-azul', nombre: 'azul', rating: 71.9, slope: 132, yardaje_total: 6395, genero: 'M',
  front_course_rating: 36, front_slope_rating: 132, back_course_rating: 35.9, back_slope_rating: 131,
}
const TEE_LEONES: CourseTeeRow = {
  id: 'tee-leones-azul', nombre: 'azul', rating: 75.1, slope: 142, yardaje_total: 6600, genero: 'M',
  front_course_rating: null, front_slope_rating: null, back_course_rating: null, back_slope_rating: null,
}

const HCP_BRISAS: LegacyHcpContext = {
  mode: 'whs', tees: 'azul',
  course: { par_total: 72, slope_rating: 113, course_rating: 71.9 },
  courseTees: [TEE_BRISAS],
}
const HCP_LEONES: LegacyHcpContext = {
  mode: 'whs', tees: 'azul',
  course: { par_total: 72, slope_rating: 142, course_rating: 75.1 },
  courseTees: [TEE_LEONES],
}

const BASE: TournamentLeaderboardContext = {
  parTotal: 72, totalHoyos: 18, modoJuego: 'neto', formatoJuego: 'stroke_play',
  courseHoles: HOLES_BRISAS, hcp: HCP_BRISAS,
}
const RONDA_2_LEONES: RoundLeaderboardContext = {
  parTotal: 72, totalHoyos: 18, courseHoles: HOLES_LEONES, hcp: HCP_LEONES,
}

/** 18 hoyos todos a par + 1 (bogey en cada uno). */
function tarjetaBogeys(holes: CourseHole[]) {
  return holes.map((h) => ({ hole_number: h.numero, gross_score: h.par + 1 }))
}

function jugador(indice: number, rounds: DBPlayer['rounds']): DBPlayer {
  return {
    id: `p-${indice}`,
    handicap_at_registration: indice,
    player_name: `Índice ${indice}`,
    profiles: null,
    categories: null,
    // El tee_id apunta a la cancha de la ronda 1; en Los Leones no matchea y
    // el fallback resuelve por el tee GLOBAL del torneo ('azul') — por nombre,
    // en la cancha de esa ronda.
    tee_id: 'tee-brisas-azul',
    rounds,
  }
}

function ronda(round_number: number, holes: CourseHole[]) {
  return {
    id: `r${round_number}`, status: 'closed', total_gross: 0, total_net: 0, total_points: 0,
    round_number, hole_scores: tarjetaBogeys(holes),
  }
}

/** El neto que un scorer parado en ESA cancha calcularía, hoyo por hoyo. */
function netoEsperado(indice: number, holes: CourseHole[], hcpCtx: LegacyHcpContext, teeId: string): number {
  const courseHcp = resolveScoringCourseHcp(
    'whs',
    { handicap_at_registration: indice, tee_id: teeId },
    { tees: hcpCtx.tees, courses: hcpCtx.course },
    hcpCtx.courseTees,
    72,
    18,
  )
  const si = normalizedStrokeIndexByHole(holes, 18)
  return holes.reduce((s, h) => s + (h.par + 1) - strokesRecibidosEnHoyo(courseHcp, si[h.numero], 18), 0)
}

describe('buildLeaderboardFromLegacy — cada ronda se puntúa con SU cancha', () => {
  const indice = 12

  it('las dos canchas reparten handicaps distintos al mismo jugador (premisa del test)', () => {
    const enBrisas = resolveScoringCourseHcp('whs', { handicap_at_registration: indice, tee_id: 'tee-brisas-azul' }, { tees: 'azul', courses: HCP_BRISAS.course }, HCP_BRISAS.courseTees, 72, 18)
    const enLeones = resolveScoringCourseHcp('whs', { handicap_at_registration: indice, tee_id: 'tee-brisas-azul' }, { tees: 'azul', courses: HCP_LEONES.course }, HCP_LEONES.courseTees, 72, 18)
    expect(enBrisas).toBe(14)
    expect(enLeones).toBe(18)
  })

  it('con contexto por ronda, el neto acumulado = neto en Brisas + neto en Los Leones', () => {
    const out = buildLeaderboardFromLegacy(
      [jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_LEONES)])],
      { ...BASE, rounds: new Map([[2, RONDA_2_LEONES]]) },
      2,
    )
    const p = out.playersByNeto[0]
    const esperado =
      netoEsperado(indice, HOLES_BRISAS, HCP_BRISAS, 'tee-brisas-azul') +
      netoEsperado(indice, HOLES_LEONES, HCP_LEONES, 'tee-brisas-azul')
    // 36 bogeys = +36 gross; neto = 36 − 14 − 18 = +4 sobre 144 de par.
    expect(p.total).toBe(esperado - 144)
    expect(p.total).toBe(4)
    expect(p.holes).toBe(36)
  })

  it('SIN contexto por ronda (torneo legacy) la ronda 2 se puntúa con la cancha de la 1 — y da otro número', () => {
    // Fija la diferencia para que quede claro qué corrige `rounds`: sin él,
    // la ronda 2 recibe 14 golpes (Brisas) en vez de 18 (Los Leones).
    const out = buildLeaderboardFromLegacy(
      [jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_LEONES)])],
      BASE,
      2,
    )
    expect(out.playersByNeto[0].total).toBe(36 - 14 - 14)
  })

  it('un torneo que repite cancha con `rounds` vacío da lo mismo que sin `rounds` (cero regresión)', () => {
    const jugadores = [jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_BRISAS)])]
    const sin = buildLeaderboardFromLegacy(jugadores, BASE, 2)
    const con = buildLeaderboardFromLegacy(jugadores, { ...BASE, rounds: new Map() }, 2)
    expect(con.playersByNeto[0]).toEqual(sin.playersByNeto[0])
    expect(con.players[0].total).toBe(36 - 28)
  })

  it('el "hoy" (todayVsPar) de un multi-ronda es el de la ÚLTIMA ronda, con SU cancha', () => {
    const out = buildLeaderboardFromLegacy(
      [jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_LEONES)])],
      { ...BASE, rounds: new Map([[2, RONDA_2_LEONES]]) },
      2,
    )
    // Ronda 2 en Los Leones: 18 bogeys − 18 golpes = par → today = 0.
    expect(out.players[0].today).toBe(0)
  })

  it('la ronda 2 en una cancha de 9 hoyos usa 9 hoyos y el course handicap de 9', () => {
    const HOLES_9 = HOLES_BRISAS.slice(0, 9)
    const ronda2de9: RoundLeaderboardContext = {
      parTotal: 36, totalHoyos: 9, courseHoles: HOLES_9, hcp: HCP_BRISAS,
    }
    const out = buildLeaderboardFromLegacy(
      [jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_9)])],
      { ...BASE, rounds: new Map([[2, ronda2de9]]) },
      2,
    )
    const p = out.playersByNeto[0]
    expect(p.holes).toBe(27)
    // 9h en Brisas con front ratings: CH9 = round(6 × 132/113 + (36 − 36)) = 7.
    const hcp9 = resolveScoringCourseHcp('whs', { handicap_at_registration: indice, tee_id: 'tee-brisas-azul' }, { tees: 'azul', courses: HCP_BRISAS.course }, HCP_BRISAS.courseTees, 36, 9)
    expect(hcp9).toBe(7)
    expect(p.total).toBe((18 - 14) + (9 - hcp9))
    // La tarjeta mostrada es la de la última ronda: 9 casilleros.
    expect(out.players[0].scores).toHaveLength(9)
  })

  it('la categoría con default_tee_color resuelve el tee por NOMBRE en la cancha de cada ronda', () => {
    const conCategoria: DBPlayer = {
      ...jugador(indice, [ronda(1, HOLES_BRISAS), ronda(2, HOLES_LEONES)]),
      tee_id: null,
      categories: { name: 'Caballeros', default_tee_color: 'azul' },
    }
    // Sin tee global: sólo la categoría puede resolver el tee.
    const sinGlobal = (h: LegacyHcpContext): LegacyHcpContext => ({ ...h, tees: null })
    const out = buildLeaderboardFromLegacy(
      [conCategoria],
      { ...BASE, hcp: sinGlobal(HCP_BRISAS), rounds: new Map([[2, { ...RONDA_2_LEONES, hcp: sinGlobal(HCP_LEONES) }]]) },
      2,
    )
    expect(out.playersByNeto[0].total).toBe(36 - 14 - 18)
  })
})
