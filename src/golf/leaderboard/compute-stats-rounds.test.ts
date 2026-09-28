// Multi-ronda con canchas de par DISTINTO: birdies/eagles de cada ronda se
// miden contra el par de SU cancha, y la dificultad por hoyo se agrupa por
// CANCHA real (A,B,A,B son dos canchas, no cuatro rondas). Antes
// `computeStats` usaba el par de la ronda 1 para todas: un 4 en el hoyo 1 de
// la ronda 2 (par 5 allá) contaba como par en vez de birdie.

import { describe, it, expect } from 'vitest'
import { computeStats } from './compute-stats'
import type { CourseHole } from './types'

const PAR4: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
// Cancha B: par 5 en el hoyo 1, par 3 en el 2, el resto par 4.
const CANCHA_B: CourseHole[] = PAR4.map((h) => (h.numero === 1 ? { ...h, par: 5 } : h.numero === 2 ? { ...h, par: 3 } : h))
const R2_EN_B = new Map([[2, { courseHoles: CANCHA_B, courseId: 'B' }]])

const jugador = {
  profiles: { name: 'Ana' },
  rounds: [
    { round_number: 1, hole_scores: [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 4 }] },
    { round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 4 }] },
  ],
}

describe('computeStats — cada ronda contra el par de SU cancha', () => {
  it('con rounds: el 4 del hoyo 1 en la ronda 2 es birdie (par 5), el del hoyo 2 bogey (par 3)', () => {
    const s = computeStats([jugador], PAR4, [], R2_EN_B, 'A')
    expect(s?.birdies).toBe(1)
    expect(s?.eagles).toBe(0)
  })

  it('sin rounds (una cancha): conducta previa — todo contra la ronda 1, cero birdies', () => {
    const s = computeStats([jugador], PAR4, [])
    expect(s?.birdies).toBe(0)
  })

  it('hoyo más difícil/fácil: el hoyo 1 de la cancha A y el de la B son hoyos distintos, y se dice cuál', () => {
    // Ronda 1 (A, par 4): hoyo 1 = +3. Ronda 2 (B, par 5): hoyo 1 = −1.
    const j = {
      profiles: { name: 'Ana' },
      rounds: [
        { round_number: 1, hole_scores: [{ hole_number: 1, gross_score: 7 }] },
        { round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 4 }] },
      ],
    }
    const s = computeStats([j], PAR4, [], R2_EN_B, 'A')
    expect(s?.hardestHole).toEqual({ hole: 1, avg: 3, courseId: 'A' })
    expect(s?.easiestHole).toEqual({ hole: 1, avg: -1, courseId: 'B' })
  })

  it('A,B,A,B: las rondas 2 y 4 (misma cancha B) comparten grupo', () => {
    const j = {
      profiles: { name: 'Ana' },
      rounds: [
        { round_number: 1, hole_scores: [{ hole_number: 1, gross_score: 4 }] },
        { round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 6 }] }, // B: +1
        { round_number: 3, hole_scores: [{ hole_number: 1, gross_score: 4 }] },
        { round_number: 4, hole_scores: [{ hole_number: 1, gross_score: 8 }] }, // B: +3
      ],
    }
    const rounds = new Map([
      [2, { courseHoles: CANCHA_B, courseId: 'B' }],
      [4, { courseHoles: CANCHA_B, courseId: 'B' }],
    ])
    const s = computeStats([j], PAR4, [], rounds, 'A')
    // Un solo grupo B#1 con promedio (1+3)/2 = 2, no dos grupos de +1 y +3.
    expect(s?.hardestHole).toEqual({ hole: 1, avg: 2, courseId: 'B' })
    expect(s?.easiestHole).toEqual({ hole: 1, avg: 0, courseId: 'A' })
  })

  it('un eagle en la ronda 2 (3 en el par 5) se cuenta como eagle', () => {
    const j = { ...jugador, rounds: [{ round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 3 }] }] }
    expect(computeStats([j], PAR4, [], R2_EN_B, 'A')?.eagles).toBe(1)
    expect(computeStats([j], PAR4, [])?.eagles).toBe(0) // contra par 4 sería birdie
  })
})
