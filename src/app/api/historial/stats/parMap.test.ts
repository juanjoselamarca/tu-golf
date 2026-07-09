import { describe, it, expect } from 'vitest'
import { buildCourseParMap } from './parMap'

describe('buildCourseParMap — bug inbox 2268163d ("los eagles no me calzan")', () => {
  it('coloca cada par en su hoyo aunque el input llegue desordenado', () => {
    // Simula lo que devolvía la paginación inestable: filas de la MISMA cancha
    // en orden arbitrario (no por numero).
    const holes = [
      { course_id: 'A', numero: 3, par: 5 },
      { course_id: 'A', numero: 1, par: 4 },
      { course_id: 'A', numero: 7, par: 3 },
      { course_id: 'A', numero: 2, par: 4 },
    ]
    const map = buildCourseParMap(holes)
    const pars = map.get('A')!
    expect(pars[0]).toBe(4) // hoyo 1
    expect(pars[1]).toBe(4) // hoyo 2
    expect(pars[2]).toBe(5) // hoyo 3
    expect(pars[6]).toBe(3) // hoyo 7 — antes salía par 5 por desalineación
  })

  it('reproduce el caso Las Brisas Sur-Este: hoyo 7 es par 3, no par 5', () => {
    // Pares reales de la cancha (18 hoyos), llegando en orden inverso a propósito.
    const realPars = [4, 4, 4, 3, 5, 4, 3, 5, 4, 5, 3, 4, 4, 5, 4, 3, 4, 4]
    const holes = realPars
      .map((par, i) => ({ course_id: 'brisas', numero: i + 1, par }))
      .reverse()
    const pars = buildCourseParMap(holes).get('brisas')!

    expect(pars.length).toBe(18)
    expect(pars).toEqual(realPars)

    // Con los pares alineados, un score de 3 en el hoyo 7 (par 3) es PAR, no eagle.
    const scores = [4, 6, 4, 4, 4, 4, 3, 5, 7] // ronda de 9h real de Juanjo
    const front9 = pars.slice(0, scores.length)
    let eagles = 0
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] - front9[i] <= -2) eagles++
    }
    expect(eagles).toBe(0) // antes contaba 1 eagle fantasma en el hoyo 7
  })

  it('separa canchas distintas correctamente', () => {
    const holes = [
      { course_id: 'A', numero: 1, par: 4 },
      { course_id: 'B', numero: 1, par: 3 },
      { course_id: 'A', numero: 2, par: 5 },
      { course_id: 'B', numero: 2, par: 4 },
    ]
    const map = buildCourseParMap(holes)
    expect(map.get('A')).toEqual([4, 5])
    expect(map.get('B')).toEqual([3, 4])
  })
})
