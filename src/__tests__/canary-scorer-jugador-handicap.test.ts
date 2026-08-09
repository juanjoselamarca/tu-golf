/**
 * CANARIO — los dos scorers de torneo reparten el MISMO handicap.
 *
 * Golfers+ tiene dos pantallas que escriben el score de un torneo:
 *   · el scorer del ORGANIZADOR  (`organizador/[slug]/scoring`)
 *   · el scorer del JUGADOR      (`torneo/[slug]/score`)
 *
 * Ambas persisten `net_score` y `points` con `POST /api/game`. Hasta el
 * 09-ago-2026 el del organizador repartía golpes con el course handicap del
 * gate (`resolveScoringCourseHcp`) y el del jugador con el ÍNDICE CRUDO. En un
 * torneo `hcp_calc_mode='whs'` sobre cancha con slope ≠ 113 los dos escribían
 * netos distintos para el mismo golpe, y el del jugador dejaba el número malo
 * guardado en la base.
 *
 * El bug era latente mientras todos los torneos eran `raw`. Dejó de serlo el
 * 30-jul-2026, cuando el default de `hcp_calc_mode` pasó a `whs`: hoy cada
 * torneo nuevo nace en el modo que lo dispara.
 *
 * Este canario fija las dos mitades del arreglo:
 *   1. NUMÉRICA  — el puntaje de un hoyo sale de una sola función para ambos.
 *   2. DE FUENTE — el scorer del jugador no puede volver a alimentar las
 *      funciones de scoring con `handicap_at_registration`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { puntajeDeHoyo } from '@/golf/core/hole-scoring'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

// ── Contexto REAL de prod: Club de Golf Los Leones, slope 142 / CR 75.1, par 72.
// Es la cancha de `gate-scorer-matchplay-18h`, uno de los torneos que hoy están
// en `hcp_calc_mode='whs'`. Con estos números un índice 12 recibe 18 golpes: SEIS
// más que los que repartía el scorer del jugador. En un torneo neto eso no es un
// decimal, es el campeonato. ──
const COURSE_TEES: CourseTeeRow[] = [
  { id: 'tee-azul', nombre: 'azul', slope: 142, rating: 75.1, par_total: 72 } as unknown as CourseTeeRow,
]

const TOURNEY = {
  tees: 'azul',
  courses: { par_total: 72, slope_rating: 142, course_rating: 75.1 },
}

const JUGADOR = { handicap_at_registration: 12, tee_id: 'tee-azul' }

/** Los 6 golpes de diferencia, fijados como número. */
const COURSE_HCP_ESPERADO = 18

const PAR_TOTAL = 72
const HOLE_COUNT = 18

describe('canario · el course handicap del gate NO es el índice crudo', () => {
  it('en Los Leones un índice 12 recibe 18 golpes, no 12', () => {
    const courseHcp = resolveScoringCourseHcp('whs', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)
    // Si estos dos números fueran iguales, el canario no probaría nada:
    // la divergencia es justamente lo que el bug hacía invisible.
    expect(courseHcp).toBe(COURSE_HCP_ESPERADO)
    expect(courseHcp - JUGADOR.handicap_at_registration).toBe(6)
  })

  it('en modo raw el gate devuelve el índice crudo — el fix es NO-OP para torneos viejos', () => {
    const courseHcp = resolveScoringCourseHcp('raw', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)
    expect(courseHcp).toBe(JUGADOR.handicap_at_registration)
  })
})

describe('canario · puntajeDeHoyo es la fuente única del neto y los puntos', () => {
  const courseHcp = resolveScoringCourseHcp('whs', JUGADOR, TOURNEY, COURSE_TEES, PAR_TOTAL, HOLE_COUNT)

  it('el neto sale de gross menos los golpes del COURSE handicap', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stroke_play',
    })
    expect(p.strokesRecibidos).toBe(strokesRecibidosEnHoyo(courseHcp, 1, HOLE_COUNT))
    expect(p.neto).toBe(5 - p.strokesRecibidos)
  })

  it('fuera de stableford los puntos son 0 — no se persiste un número inventado', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stroke_play',
    })
    expect(p.puntos).toBe(0)
  })

  it('en stableford los puntos usan el course handicap, no el índice', () => {
    const p = puntajeDeHoyo({
      gross: 5, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: 'stableford',
    })
    expect(p.puntos).toBe(puntosStablefordHoyo(5, 4, courseHcp, 1, HOLE_COUNT))
  })

  it('resuelve el formato por las DOS columnas: `format` legacy también cuenta', () => {
    // En prod hay torneos con `formato_juego='stroke_play'` y `format='stableford'`.
    // El scorer del jugador miraba sólo `formato_juego` y no escribía puntos.
    const p = puntajeDeHoyo({
      gross: 4, par: 4, courseHandicap: courseHcp, strokeIndex: 1,
      holeCount: HOLE_COUNT, formato: { formato_juego: null, format: 'stableford' },
    })
    expect(p.puntos).toBeGreaterThan(0)
  })
})

describe('canario de fuente · el scorer del jugador no vuelve al índice crudo', () => {
  const RUTA = join(process.cwd(), 'src/app/torneo/[slug]/score/page.tsx')
  const fuente = readFileSync(RUTA, 'utf-8')

  it('no alimenta las funciones de scoring con handicap_at_registration', () => {
    // El nombre de la variable era `handicapIndex` y se pasaba tal cual a
    // `strokesRecibidosEnHoyo` / `puntosStablefordHoyo`. Ese es el patrón que
    // este canario prohíbe.
    const sospechosas = fuente
      .split('\n')
      .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
      .filter(({ linea }) => /handicap_at_registration/.test(linea))
      .filter(({ linea }) => !linea.startsWith('//') && !linea.startsWith('*'))
      // Mostrar el índice del jugador en pantalla ("HCP 10") es legítimo: el
      // jugador se identifica por su índice, no por su course handicap. Lo que
      // no puede pasar es que ese número entre a un CÁLCULO.
      .filter(({ linea }) =>
        /strokes|stableford|neto|net[A-Z]|puntaje|puntos|courseHandicap|courseHcp|handicapIndex/i.test(
          linea,
        ),
      )

    expect(sospechosas).toEqual([])
  })

  it('importa el gate canónico del handicap de scoring', () => {
    expect(fuente).toMatch(/resolveScoringCourseHcp/)
  })

  it('deriva el puntaje del hoyo de la fuente única', () => {
    expect(fuente).toMatch(/puntajeDeHoyo/)
  })

  it('no arma sus propias queries de torneo/roster — usa la capa de datos', () => {
    // Las dos pantallas que escriben score comparten `scoring.ts`. Si esta
    // volviera a hacer su propio `.from('tournaments')`, podría dejar de traer
    // `hcp_calc_mode` o los tees y el gate caería en silencio al índice crudo.
    expect(fuente).not.toMatch(/\.from\(['"`]/)
  })
})

describe('canario de fuente · el GWI del torneo reparte con el gate', () => {
  const RUTA = join(process.cwd(), 'src/app/api/gwi/torneo/[slug]/route.ts')
  const fuente = readFileSync(RUTA, 'utf-8')

  it('reparte los golpes con el course handicap, no con el índice', () => {
    // `hcp` es el índice de skill y el GWI lo necesita para la varianza; lo que
    // no puede volver a pasar es que ESE número reparta golpes.
    const repartos = fuente
      .split('\n')
      .filter((l) => /strokesRecibidosEnHoyo\(|puntosStablefordHoyo\(/.test(l))

    expect(repartos.length).toBeGreaterThan(0)
    for (const linea of repartos) {
      expect(linea).toMatch(/courseHcp/)
    }
  })

  it('toma el contexto del gate de la misma fuente que el board', () => {
    expect(fuente).toMatch(/fetchLegacyHcpContext/)
  })
})
