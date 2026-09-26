// Multi-ronda con canchas de par DISTINTO: birdies/eagles de cada ronda se
// miden contra el par de SU cancha. Antes `computeStats` usaba el par de la
// ronda 1 para todas: un 4 en el hoyo 1 de la ronda 2 (par 5 allá) contaba
// como par en vez de birdie.

import { describe, it, expect } from 'vitest'
import { computeStats } from './compute-stats'
import type { CourseHole } from './types'

const PAR4: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
// Ronda 2: par 5 en el hoyo 1, par 3 en el 2, el resto par 4.
const RONDA2: CourseHole[] = PAR4.map((h) => (h.numero === 1 ? { ...h, par: 5 } : h.numero === 2 ? { ...h, par: 3 } : h))

const jugador = {
  profiles: { name: 'Ana' },
  rounds: [
    { round_number: 1, hole_scores: [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 4 }] },
    { round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 4 }] },
  ],
}

describe('computeStats — cada ronda contra el par de SU cancha', () => {
  it('con holesByRound: el 4 del hoyo 1 en la ronda 2 es birdie (par 5), el del hoyo 2 bogey (par 3)', () => {
    const s = computeStats([jugador], PAR4, [], new Map([[2, RONDA2]]))
    expect(s?.birdies).toBe(1)
    expect(s?.eagles).toBe(0)
  })

  it('sin holesByRound (una cancha): conducta previa — todo contra la ronda 1, cero birdies', () => {
    const s = computeStats([jugador], PAR4, [])
    expect(s?.birdies).toBe(0)
  })

  it('un eagle en la ronda 2 (3 en el par 5) se cuenta como eagle', () => {
    const j = { ...jugador, rounds: [{ round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 3 }] }] }
    expect(computeStats([j], PAR4, [], new Map([[2, RONDA2]]))?.eagles).toBe(1)
    expect(computeStats([j], PAR4, [])?.eagles).toBe(0) // contra par 4 sería birdie
  })
})
