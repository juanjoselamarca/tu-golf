// Regresión P0 (30-jul-2026): la TABLA PÚBLICA del torneo repartía los golpes de
// handicap con el ÍNDICE crudo, mientras la tarjeta del organizador ya repartía el
// COURSE HANDICAP WHS (PR #289). En una vuelta de 9 hoyos eso es el DOBLE de golpes:
// las dos pantallas del mismo torneo mostraban netos distintos.
//
// Acá se fija el contrato del board (`buildLeaderboardFromLegacy`):
//   1. los GOLPES salen del mismo motor que el scorer (`resolveScoringCourseHcp`),
//   2. el ÍNDICE a la vista (`hcpDisplay`) NUNCA se toca — 12.0 se ve 12,
//   3. el gate `hcp_calc_mode` manda: los torneos que no son 'whs' quedan congelados.
//
// Los números de cancha son reales: C.G. Las Brisas de Santo Domingo Norte-Sur
// (VARONES) — par 72, slope 113, CR 71.9 — y sus 18 hoyos de catálogo.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromLegacy } from './build-from-legacy'
import type { CourseHole, LegacyHcpContext, TournamentLeaderboardContext } from './types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { parDeLosHoyosJugados } from '@/golf/core/course-handicap'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'

// ── Cancha real (Las Brisas Norte-Sur VARONES) ─────────────────────────────
const PARS = [4, 4, 4, 3, 5, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 3, 5, 4]
const SIS  = [15, 13, 3, 11, 9, 1, 17, 7, 5, 16, 2, 6, 12, 10, 14, 18, 4, 8]
const LB_HOLES: CourseHole[] = PARS.map((par, i) => ({
  numero: i + 1,
  par,
  stroke_index: SIS[i],
}))
const PAR_FRONT_9 = 36 // 4+4+4+3+5+4+3+5+4
const PAR_18 = 72

const LB_COURSE = { par_total: PAR_18, slope_rating: 113, course_rating: 71.9 }

// Tees reales del catálogo de esa cancha (con front ratings publicados).
const TEE_AZUL: CourseTeeRow = {
  id: 'tee-azul', nombre: 'azul', rating: 71.9, slope: 132, yardaje_total: 6395,
  genero: 'M', front_course_rating: 36, front_slope_rating: 132,
  back_course_rating: 35.9, back_slope_rating: 131,
}
const TEE_DORADO: CourseTeeRow = {
  id: 'tee-dorado', nombre: 'dorado', rating: 67.3, slope: 118, yardaje_total: 5575,
  genero: 'M', front_course_rating: 33.4, front_slope_rating: 115,
  back_course_rating: 33.9, back_slope_rating: 121,
}

function hcpCtx(over: Partial<LegacyHcpContext> = {}): LegacyHcpContext {
  return {
    mode: 'whs',
    tees: 'per_player',
    course: LB_COURSE,
    courseTees: [TEE_AZUL, TEE_DORADO],
    ...over,
  }
}

function ctxDe(totalHoyos: number, hcp: LegacyHcpContext | null): TournamentLeaderboardContext {
  return {
    parTotal: PAR_18,
    totalHoyos,
    modoJuego: 'neto',
    formatoJuego: 'stroke_play',
    courseHoles: LB_HOLES,
    hcp,
  }
}

/** Jugador con tarjeta completa: `grossPorHoyo` golpes en cada uno de los `holes` hoyos. */
function jugador(
  id: string,
  indice: number,
  holes: number,
  opts: { teeId?: string | null; grossPorHoyo?: (par: number) => number } = {},
): DBPlayer {
  const gross = opts.grossPorHoyo ?? ((par: number) => par)
  return {
    id,
    handicap_at_registration: indice,
    player_name: `Jugador ${id}`,
    profiles: null,
    category_id: null,
    tee_id: opts.teeId ?? null,
    categories: null,
    rounds: [
      {
        id: `r-${id}`,
        status: 'closed',
        total_gross: 0,
        total_net: 0,
        total_points: 0,
        round_number: 1,
        hole_scores: Array.from({ length: holes }, (_, i) => ({
          hole_number: i + 1,
          gross_score: gross(PARS[i]),
        })),
      },
    ],
  }
}

/** El neto que calcula la TARJETA del organizador, replicando scoring/page.tsx
 *  paso por paso. Es la referencia contra la que el board tiene que coincidir. */
function netoDelScorer(p: DBPlayer, totalHoyos: number, hcp: LegacyHcpContext | null): number {
  const parDeLaRonda = parDeLosHoyosJugados(LB_HOLES, totalHoyos)
  const courseHcp = resolveScoringCourseHcp(
    hcp?.mode ?? null,
    { handicap_at_registration: p.handicap_at_registration, tee_id: p.tee_id ?? null },
    { tees: hcp?.tees ?? null, courses: hcp?.course ?? null },
    hcp?.courseTees ?? [],
    parDeLaRonda,
    totalHoyos,
  )
  const siAlloc = normalizedStrokeIndexByHole(LB_HOLES, totalHoyos)
  return (p.rounds[0].hole_scores ?? []).reduce((sum, hs) => {
    const si = siAlloc[hs.hole_number] ?? hs.hole_number
    return sum + (hs.gross_score ?? 0) - strokesRecibidosEnHoyo(courseHcp, si, totalHoyos)
  }, 0)
}

// ───────────────────────────────────────────────────────────────────────────
describe('buildLeaderboardFromLegacy — golpes de handicap en 9 hoyos', () => {
  it('índice 12 en una vuelta de 9h reparte 6 golpes, no 12 (WHS: índice/2)', () => {
    const p = jugador('a', 12, 9)
    const { players } = buildLeaderboardFromLegacy([p], ctxDe(9, hcpCtx()), 1)

    // Tarjeta de pares clavados: gross 36. Neto = 36 − golpes repartidos.
    expect(players[0].grossTotal).toBe(PAR_FRONT_9)
    expect(players[0].netTotal).toBe(PAR_FRONT_9 - 6)
    // Antes de este fix el board restaba el índice entero: 36 − 12 = 24.
    expect(players[0].netTotal).not.toBe(PAR_FRONT_9 - 12)
  })

  it('la misma vuelta en 18 hoyos NO se toca: el course handicap 18h ≈ índice', () => {
    const p = jugador('a', 12, 18)
    const { players } = buildLeaderboardFromLegacy([p], ctxDe(18, hcpCtx()), 1)
    // slope 113 y CR 71.9 vs par 72 → round(12 × 1 + (71.9 − 72)) = 12.
    expect(players[0].netTotal).toBe(PAR_18 - 12)
  })

  it('el tee del jugador cambia los golpes, igual que en cancha', () => {
    const azul   = jugador('azul', 12, 9, { teeId: 'tee-azul' })
    const dorado = jugador('dorado', 12, 9, { teeId: 'tee-dorado' })
    const { players } = buildLeaderboardFromLegacy([azul, dorado], ctxDe(9, hcpCtx()), 1)

    const byId = new Map(players.map((pl) => [pl.id, pl]))
    // azul:   round(6 × 132/113 + (36 − 36))   = 7
    // dorado: round(6 × 115/113 + (33.4 − 36)) = 4
    expect(byId.get('azul')!.netTotal).toBe(PAR_FRONT_9 - 7)
    expect(byId.get('dorado')!.netTotal).toBe(PAR_FRONT_9 - 4)
  })
})

describe('buildLeaderboardFromLegacy — el ÍNDICE a la vista no se toca', () => {
  it('9h con WHS: los golpes bajan a 6 pero la columna HCP sigue mostrando 12', () => {
    const { players } = buildLeaderboardFromLegacy([jugador('a', 12, 9)], ctxDe(9, hcpCtx()), 1)
    expect(players[0].hcpDisplay).toBe(12)
    expect(players[0].hcp).toBe(6) // el de scoring, el que reparte golpes
  })

  it('hcpDisplay == índice inscrito en toda combinación de hoyos/gate/tee', () => {
    const casos: Array<[number, LegacyHcpContext | null, string | null]> = [
      [9,  hcpCtx(), null],
      [9,  hcpCtx(), 'tee-dorado'],
      [18, hcpCtx(), 'tee-azul'],
      [9,  hcpCtx({ mode: 'raw' }), null],
      [9,  null, null],
    ]
    for (const [holes, hcp, teeId] of casos) {
      const { players } = buildLeaderboardFromLegacy(
        [jugador('a', 12, holes, { teeId })],
        ctxDe(holes, hcp),
        1,
      )
      expect(players[0].hcpDisplay).toBe(12)
    }
  })

  it('un inscrito sin tarjeta también muestra su índice, no el course handicap', () => {
    const sinRonda = { ...jugador('b', 12, 0), rounds: [] }
    const { players } = buildLeaderboardFromLegacy([sinRonda], ctxDe(9, hcpCtx()), 1)
    expect(players[0].hcpDisplay).toBe(12)
  })
})

describe('buildLeaderboardFromLegacy — gate hcp_calc_mode (torneos congelados)', () => {
  it("mode 'raw' deja el índice crudo: un torneo en curso no cambia de neto", () => {
    const p = jugador('a', 12, 9)
    const { players } = buildLeaderboardFromLegacy([p], ctxDe(9, hcpCtx({ mode: 'raw' })), 1)
    expect(players[0].netTotal).toBe(PAR_FRONT_9 - 12)
  })

  it('sin contexto de handicap (query caída) cae al índice crudo, no a 0 golpes', () => {
    const p = jugador('a', 12, 9)
    const { players } = buildLeaderboardFromLegacy([p], ctxDe(9, null), 1)
    expect(players[0].netTotal).toBe(PAR_FRONT_9 - 12)
  })
})

describe('buildLeaderboardFromLegacy — paridad con la tarjeta del organizador', () => {
  // El invariante que este PR existe para garantizar: para CUALQUIER jugador,
  // el neto del board == el neto que calcula el scorer con el mismo motor.
  const escenarios: Array<{ nombre: string; holes: number; hcp: LegacyHcpContext | null }> = [
    { nombre: '9h WHS sin tee asignado',  holes: 9,  hcp: hcpCtx() },
    { nombre: '9h WHS con tees por jugador', holes: 9, hcp: hcpCtx() },
    { nombre: '18h WHS',                  holes: 18, hcp: hcpCtx() },
    { nombre: '9h gate raw',              holes: 9,  hcp: hcpCtx({ mode: 'raw' }) },
    { nombre: '9h sin catálogo de tees',  holes: 9,  hcp: hcpCtx({ courseTees: [] }) },
    { nombre: '9h sin ratings de cancha', holes: 9,  hcp: hcpCtx({ course: null, courseTees: [] }) },
  ]

  for (const { nombre, holes, hcp } of escenarios) {
    it(`${nombre}: el neto del board coincide con el de la tarjeta`, () => {
      const tees = [null, 'tee-azul', 'tee-dorado']
      const indices = [-2, 0, 5.4, 12, 18, 27, 36]
      const jugadores = indices.flatMap((idx, i) =>
        tees.map((teeId, j) =>
          jugador(`p${i}-${j}`, idx, holes, {
            teeId,
            grossPorHoyo: (par) => par + ((i + j) % 3),
          }),
        ),
      )
      const { players } = buildLeaderboardFromLegacy(jugadores, ctxDe(holes, hcp), 1)
      expect(players).toHaveLength(jugadores.length)

      const netoEsperado = new Map(jugadores.map((p) => [p.id, netoDelScorer(p, holes, hcp)]))
      for (const pl of players) {
        expect(pl.netTotal, `jugador ${pl.id}`).toBe(netoEsperado.get(pl.id!))
      }
    })
  }
})
