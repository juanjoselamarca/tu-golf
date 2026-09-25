// Bug de golf (code review 25-sep-2026): 23 de 24 torneos de prod apuntan a la
// fila VARONES de FedeGolf, y `resolvePlayerTee` matcheaba sólo por nombre. Una
// jugadora con tee "blanco" recibía el CR/slope del blanco MASCULINO. WHS exige
// el rating del género del jugador.
//
// Números reales del catálogo: Hacienda Chicureo C.G. — blanco/M 71.6/137
// (fila VARONES) y blanco/F 78.6/142 (fila DAMAS). Par 72.

import { describe, it, expect } from 'vitest'
import { computePlayerCourseHcp } from './compute-player-course-hcp'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { courseHandicap18h } from './stroke-index'

const BLANCO_M: CourseTeeRow = {
  id: 'v-blanco', nombre: 'blanco', rating: 71.6, slope: 137, yardaje_total: 6100, genero: 'M',
}
const BLANCO_F: CourseTeeRow = {
  id: 'd-blanco', nombre: 'blanco', rating: 78.6, slope: 142, yardaje_total: 6100, genero: 'F',
}
// La fila del torneo (VARONES) primero, después su hermana (DAMAS): el orden
// que arma `getTeesWithGenderVariants`.
const TEES = [BLANCO_M, BLANCO_F]
const TORNEO = { tees: 'blanco', courses: { par_total: 72, slope_rating: 137, course_rating: 71.6 } }
const PAR = 72
const HOLES = 18

describe('computePlayerCourseHcp — el tee del género del jugador', () => {
  it('una jugadora (profiles.genero = F) recibe el course handicap del blanco/F', () => {
    const hcp = computePlayerCourseHcp(
      { handicap_at_registration: 20, tee_id: null, profiles: { genero: 'F' } },
      TORNEO, TEES, PAR, HOLES,
    )
    expect(hcp).toBe(courseHandicap18h(20, 142, 78.6, 72))
    expect(hcp).toBe(32) // round(20 × 142/113 + 6.6) = round(31.7)
  })

  it('un jugador (M) recibe el del blanco/M — y son SIETE golpes menos', () => {
    const hcp = computePlayerCourseHcp(
      { handicap_at_registration: 20, tee_id: null, profiles: { genero: 'M' } },
      TORNEO, TEES, PAR, HOLES,
    )
    expect(hcp).toBe(courseHandicap18h(20, 137, 71.6, 72))
    expect(hcp).toBe(24) // round(20 × 137/113 − 0.4) = round(23.8)
  })

  it('sin perfil, la categoría "Damas" (gender F) alcanza para elegir el tee de damas', () => {
    const hcp = computePlayerCourseHcp(
      { handicap_at_registration: 20, tee_id: null, categories: { default_tee_color: null, gender: 'F' } },
      TORNEO, TEES, PAR, HOLES,
    )
    expect(hcp).toBe(32)
  })

  it('sin género conocido, la fila del torneo (VARONES): conducta previa, sin adivinar', () => {
    const hcp = computePlayerCourseHcp(
      { handicap_at_registration: 20, tee_id: null },
      TORNEO, TEES, PAR, HOLES,
    )
    expect(hcp).toBe(24)
  })

  it('sin la fila hermana cargada, una jugadora cae al blanco/M — igual que antes del fix', () => {
    const hcp = computePlayerCourseHcp(
      { handicap_at_registration: 20, tee_id: null, profiles: { genero: 'F' } },
      TORNEO, [BLANCO_M], PAR, HOLES,
    )
    expect(hcp).toBe(24)
  })
})
