import { describe, it, expect } from 'vitest'
import { computePlayerCourseHcp, resolveScoringCourseHcp } from './compute-player-course-hcp'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

const teeAzul: CourseTeeRow = { id: 'tee-azul', nombre: 'Azul', rating: 72.1, slope: 131, yardaje_total: 6573, genero: null }
const teeRojo: CourseTeeRow = { id: 'tee-rojo', nombre: 'Rojo', rating: 68.5, slope: 119, yardaje_total: 5200, genero: 'female' }
const teeBlanco: CourseTeeRow = { id: 'tee-blanco', nombre: 'Blanco', rating: 70.0, slope: 125, yardaje_total: 6100, genero: null }
const allTees = [teeAzul, teeRojo, teeBlanco]

const baseTournament = {
  tees: 'Azul',
  courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 },
}

const basePlayer = {
  handicap_at_registration: 15.0,
  tee_id: null,
  categories: null,
}

describe('computePlayerCourseHcp', () => {
  it('uses manual tee_id when assigned', () => {
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    // CH = 15 × (119/113) + (68.5 - 72) = 15 × 1.053 + (-3.5) = 15.80 - 3.5 = 12.30 → round = 12
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(12)
  })

  it('uses category default tee when no manual tee', () => {
    const player = { ...basePlayer, categories: { default_tee_color: 'Rojo' } }
    // Same as above — resolves to Rojo via category
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(12)
  })

  it('falls back to global tournament tee', () => {
    // No manual tee, no category → falls back to tournament.tees = 'Azul'
    // CH = 15 × (131/113) + (72.1 - 72) = 15 × 1.159 + 0.1 = 17.39 + 0.1 = 17.49 → round = 17
    const ch = computePlayerCourseHcp(basePlayer, baseTournament, allTees, 72, 18)
    expect(ch).toBe(17)
  })

  it('falls back to course-level ratings when no tee resolved', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 } }
    // No tees matched → uses course-level slope/CR
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 72, 18)
    expect(ch).toBe(17)
  })

  it('returns raw index when no slope/CR available', () => {
    const tournament = { tees: null, courses: null }
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 72, 18)
    expect(ch).toBe(15)
  })

  it('returns 0 for null handicap', () => {
    const player = { ...basePlayer, handicap_at_registration: null }
    const tournament = { tees: null, courses: null }
    const ch = computePlayerCourseHcp(player, tournament, [], 72, 18)
    expect(ch).toBe(0)
  })

  it('uses 9h formula with halved 18h CR when no front_course_rating', () => {
    // WHS 9h: el índice que entra es el de 9 HOYOS = índice 18h / 2 = 7.5.
    // Sin esa división el jugador recibía ~2× los golpes (los 9 hoyos sólo
    // reparten hasta SI 9). Misma regla que `resolverCourseHandicap` en el
    // camino de ronda libre desde el 11-jun-2026.
    // No front ratings → CR_9h = 68.5 / 2 = 34.25, slope stays 119
    // CH_9h = 7.5 × (119/113) + (34.25 - 36) = 7.90 - 1.75 = 6.15 → round = 6
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 36, 9)
    expect(ch).toBe(6)
  })

  it('uses front_course_rating and front_slope_rating for 9-hole when available', () => {
    const teeWith9h: CourseTeeRow = {
      ...teeRojo,
      front_course_rating: 34.5,
      front_slope_rating: 115,
    }
    // CH_9h = 7.5 × (115/113) + (34.5 - 36) = 7.63 - 1.5 = 6.13 → round = 6
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    const ch = computePlayerCourseHcp(player, baseTournament, [teeWith9h], 36, 9)
    expect(ch).toBe(6)
  })

  it('manual tee overrides category and global', () => {
    const player = {
      ...basePlayer,
      tee_id: 'tee-blanco',
      categories: { default_tee_color: 'Rojo' },
    }
    // Blanco: CH = 15 × (125/113) + (70.0 - 72) = 15 × 1.106 + (-2) = 16.59 - 2 = 14.59 → round = 15
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(15)
  })

  it('handles tee with null slope gracefully', () => {
    const teeNoSlope: CourseTeeRow = { id: 'tee-ns', nombre: 'NoSlope', rating: null, slope: null, yardaje_total: 5000, genero: null }
    const player = { ...basePlayer, tee_id: 'tee-ns' }
    // Resolved tee has no slope → falls back to course-level
    const ch = computePlayerCourseHcp(player, baseTournament, [teeNoSlope], 72, 18)
    expect(ch).toBe(17) // Uses course.slope_rating/course_rating
  })

  it('course-level fallback halves CR for 9-hole', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 } }
    // CR_9h = 72.1 / 2 = 36.05, slope = 131
    // CH_9h = 7.5 × (131/113) + (36.05 - 36) = 8.69 + 0.05 = 8.75 → round = 9
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 36, 9)
    expect(ch).toBe(9)
  })

  // Bug 30-jul-2026 (COPA LB PADRE E HIJO 2026, prod): los callers pasan el par
  // de la cancha COMPLETA aunque la ronda sea de 9 hoyos. Con el CR del front-9
  // (~36) eso daba (CR − par) ≈ −36 y course handicaps NEGATIVOS: el motor
  // trataba al jugador como plus y le QUITABA golpes.
  it('un par de 18 hoyos en una ronda de 9 NO produce un handicap negativo', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 132, course_rating: 72 } }
    const player = { ...basePlayer, handicap_at_registration: 12 }

    const ch = computePlayerCourseHcp(player, tournament, [], 72, 9) // ← par de 18

    // ANTES: round(12 × 132/113 + (36 − 72)) = round(14.02 − 36) = −22.
    // AHORA: round((12/2) × 132/113 + (36 − 36)) = round(7.01) = 7.
    expect(ch).toBe(7)
    expect(ch).toBeGreaterThan(0)
  })

  // Segundo hallazgo del review: la defensa había quedado de un solo lado. El
  // par se protegía contra la escala de 18, el Course Rating no. En una cancha
  // de 9 hoyos REALES el rating ya es de 9, y partirlo al medio devolvía otra
  // vez un negativo — el mismo síntoma por el lado contrario.
  // Caso real de prod: C.G. Río Blanco, par_total 35, rating 55, slope 113,
  // sin front ratings. Índice 12 daba −1.
  it('un rating imposible no envenena el handicap por ningún lado (Río Blanco, par 35)', () => {
    const tournament = { tees: null, courses: { par_total: 35, slope_rating: 113, course_rating: 55 } }
    const player = { ...basePlayer, handicap_at_registration: 12 }

    const ch = computePlayerCourseHcp(player, tournament, [], 35, 9)

    // El rating 55 contra par 35 no es válido en NINGUNA escala: +20 sobre el
    // par si fuera de 9, −15 si fuera de 18. Partirlo daba −1 (negativo);
    // dejarlo tal cual daba 26, que son ~3 golpes por hoyo para un índice 12 —
    // tan roto como el negativo, sólo que del otro lado. Con un dato imposible
    // el término (CR − par) se anula y queda la parte que sí es confiable:
    // 6 × (113/113) = 6.
    expect(ch).toBe(6)
    expect(ch).toBeGreaterThan(0)
  })

  it('un tee de cancha de 9 hoyos reales tampoco parte su rating', () => {
    const tee = {
      id: 'tee-9h', course_id: 'c1', nombre: 'Azul', rating: 35.5, slope: 118,
      front_course_rating: null, front_slope_rating: null, genero: null,
    }
    const tournament = { tees: null, courses: { par_total: 35, slope_rating: 113, course_rating: 55 } }
    const player = { ...basePlayer, handicap_at_registration: 12, tee_id: 'tee-9h' }

    const ch = computePlayerCourseHcp(player, tournament, [tee as never], 35, 9)

    // round(6 × 118/113 + (35.5 − 35)) = round(6.27 + 0.5) = 7 — sin partir 35.5.
    expect(ch).toBe(7)
  })

  // El índice del jugador es SIEMPRE el de 18 hoyos y no se toca: la mitad vive
  // dentro de la fórmula, no en el dato. Si algún día alguien "arregla" esto
  // guardando el índice a la mitad, el de 18 hoyos se rompe y este test lo caza.
  it('el índice de 18h del jugador entra ENTERO en la ronda de 18', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 132, course_rating: 72 } }
    const player = { ...basePlayer, handicap_at_registration: 12 }

    // round(12 × 132/113 + (72 − 72)) = round(14.02) = 14 — el doble del de 9h.
    expect(computePlayerCourseHcp(player, tournament, [], 72, 18)).toBe(14)
  })
})

describe('resolveScoringCourseHcp — gate por torneo (decisión 28-may)', () => {
  // basePlayer: índice 15, tee global 'Azul' (rating 72.1, slope 131)
  // WHS esperado = round(15 × 131/113 + (72.1−72)) = round(17.49) = 17
  const whsValue = computePlayerCourseHcp(basePlayer, baseTournament, allTees, 72, 18)

  it("mode 'whs' aplica course handicap WHS (torneos nuevos)", () => {
    expect(resolveScoringCourseHcp('whs', basePlayer, baseTournament, allTees, 72, 18)).toBe(whsValue)
    expect(whsValue).toBe(17)
  })

  it("mode 'raw' usa índice crudo, NO WHS (torneos existentes/in_progress)", () => {
    const ch = resolveScoringCourseHcp('raw', basePlayer, baseTournament, allTees, 72, 18)
    expect(ch).toBe(15) // handicap_at_registration crudo, no convertido
    expect(ch).not.toBe(whsValue)
  })

  it('mode null/undefined cae a índice crudo (default seguro, no altera histórico)', () => {
    expect(resolveScoringCourseHcp(null, basePlayer, baseTournament, allTees, 72, 18)).toBe(15)
    expect(resolveScoringCourseHcp(undefined, basePlayer, baseTournament, allTees, 72, 18)).toBe(15)
  })

  it('mode raw con índice null devuelve 0', () => {
    const player = { ...basePlayer, handicap_at_registration: null }
    expect(resolveScoringCourseHcp('raw', player, baseTournament, allTees, 72, 18)).toBe(0)
  })
})
