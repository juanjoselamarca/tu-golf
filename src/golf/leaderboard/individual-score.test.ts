// Tests del cómputo canónico del score individual de torneo.
//
// El bug que estos tests bloquean para siempre: el board individual comparaba
// el score contra el par de la CANCHA COMPLETA aunque el jugador fuera por el
// hoyo 9 → "−36" y el leaderboard quedaba al revés durante toda la ronda
// (lideraba el que MENOS hoyos llevaba). Ver `computeIndividualScore`.

import { describe, it, expect } from 'vitest'
import {
  computeIndividualScore,
  sumIndividualScores,
  EMPTY_SCORE,
  formatScoreVsPar,
} from './individual-score'
import type { CourseHole } from './types'

/** 18 hoyos par 4 (par total 72), SI = permutación 1..18 ya válida. */
const HOLES_18: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

/** Cancha real-ish: pares mezclados, par total 72. */
const HOLES_MIXED: CourseHole[] = [
  { numero: 1, par: 4, stroke_index: 5 },
  { numero: 2, par: 5, stroke_index: 11 },
  { numero: 3, par: 3, stroke_index: 17 },
  { numero: 4, par: 4, stroke_index: 1 },
  { numero: 5, par: 4, stroke_index: 7 },
  { numero: 6, par: 5, stroke_index: 13 },
  { numero: 7, par: 3, stroke_index: 15 },
  { numero: 8, par: 4, stroke_index: 3 },
  { numero: 9, par: 4, stroke_index: 9 },
  { numero: 10, par: 4, stroke_index: 6 },
  { numero: 11, par: 5, stroke_index: 12 },
  { numero: 12, par: 3, stroke_index: 18 },
  { numero: 13, par: 4, stroke_index: 2 },
  { numero: 14, par: 4, stroke_index: 8 },
  { numero: 15, par: 5, stroke_index: 14 },
  { numero: 16, par: 3, stroke_index: 16 },
  { numero: 17, par: 4, stroke_index: 4 },
  { numero: 18, par: 4, stroke_index: 10 },
]

/** Marca `n` hoyos jugados con `gross` golpes cada uno. */
function played(n: number, gross: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (let h = 1; h <= n; h++) out[String(h)] = gross
  return out
}

describe('computeIndividualScore — vs par contra hoyos JUGADOS (P0)', () => {
  it('jugador thru 9 de 18 en par NO aparece a −36: está en E', () => {
    const r = computeIndividualScore(played(9, 4), HOLES_18, 0, 18)

    expect(r.holesPlayed).toBe(9)
    expect(r.parPlayed).toBe(36)
    expect(r.grossTotal).toBe(36)
    // El bug histórico daba 36 − 72 = −36.
    expect(r.vsParGross).toBe(0)
    expect(r.vsParNet).toBe(0)
  })

  it('el que lleva MENOS hoyos no puede quedar más abajo del par por ir atrasado', () => {
    const thru3 = computeIndividualScore(played(3, 4), HOLES_18, 0, 18)
    const thru15 = computeIndividualScore(played(15, 4), HOLES_18, 0, 18)

    // Ambos van en par. Ninguno lidera por ir atrasado.
    expect(thru3.vsParGross).toBe(0)
    expect(thru15.vsParGross).toBe(0)
  })

  it('un jugador realmente bajo par sí queda bajo par', () => {
    // 9 hoyos par 4, tres birdies (3 golpes) y seis pares.
    const scores = { ...played(9, 4), '1': 3, '2': 3, '3': 3 }
    const r = computeIndividualScore(scores, HOLES_18, 0, 18)

    expect(r.grossTotal).toBe(33)
    expect(r.parPlayed).toBe(36)
    expect(r.vsParGross).toBe(-3)
  })

  it('usa el par REAL de los hoyos jugados, no un promedio', () => {
    // Hoyos 1..3 de HOLES_MIXED: par 4 + 5 + 3 = 12.
    const r = computeIndividualScore({ '1': 4, '2': 5, '3': 3 }, HOLES_MIXED, 0, 18)

    expect(r.parPlayed).toBe(12)
    expect(r.grossTotal).toBe(12)
    expect(r.vsParGross).toBe(0)
  })
})

describe('computeIndividualScore — vacío es vacío, no cero', () => {
  it('sin ningún score: hasData false y todo en cero', () => {
    const r = computeIndividualScore({}, HOLES_18, 12, 18)

    expect(r.hasData).toBe(false)
    expect(r.holesPlayed).toBe(0)
    expect(r.parPlayed).toBe(0)
    expect(r.grossTotal).toBe(0)
    expect(r.netTotal).toBe(0)
    expect(r.vsParGross).toBe(0)
    expect(r.vsParNet).toBe(0)
  })

  it('EMPTY_SCORE es el resultado canónico de "no empezó"', () => {
    expect(EMPTY_SCORE.hasData).toBe(false)
    expect(EMPTY_SCORE.holesPlayed).toBe(0)
  })

  it('un solo hoyo jugado ya es hasData true', () => {
    const r = computeIndividualScore({ '7': 5 }, HOLES_18, 0, 18)

    expect(r.hasData).toBe(true)
    expect(r.holesPlayed).toBe(1)
    expect(r.parPlayed).toBe(4)
    expect(r.vsParGross).toBe(1)
  })
})

describe('computeIndividualScore — neto DERIVADO del gross, nunca de una columna', () => {
  it('hcp 18 en 18 hoyos: un golpe por hoyo jugado', () => {
    const r = computeIndividualScore(played(18, 5), HOLES_18, 18, 18)

    expect(r.grossTotal).toBe(90)
    expect(r.netTotal).toBe(72) // 90 − 18 golpes
    expect(r.vsParNet).toBe(0)
  })

  it('hcp 9: solo los 9 hoyos de SI más bajo reciben golpe', () => {
    const r = computeIndividualScore(played(18, 5), HOLES_18, 9, 18)

    expect(r.grossTotal).toBe(90)
    expect(r.netTotal).toBe(81) // 90 − 9 golpes
  })

  it('mid-ronda con hcp: solo descuenta los golpes de los hoyos jugados', () => {
    // Hoyos 1..9, SI 1..9 → los 9 son de los más difíciles → 1 golpe c/u con hcp 18.
    const r = computeIndividualScore(played(9, 5), HOLES_18, 18, 18)

    expect(r.grossTotal).toBe(45)
    expect(r.netTotal).toBe(36) // 45 − 9
    expect(r.parPlayed).toBe(36)
    expect(r.vsParNet).toBe(0)
  })

  it('hcp 0: neto == gross', () => {
    const r = computeIndividualScore(played(18, 4), HOLES_18, 0, 18)

    expect(r.netTotal).toBe(r.grossTotal)
  })
})

describe('computeIndividualScore — stroke index no-permutación', () => {
  it('normaliza SI 18h-impar en ronda de 9h (no pierde golpes)', () => {
    // Catálogo 18h: los hoyos del front-9 tienen SI impares 1,3,5..17.
    const holes9: CourseHole[] = Array.from({ length: 9 }, (_, i) => ({
      numero: i + 1,
      par: 4,
      stroke_index: i * 2 + 1, // 1,3,5,7,9,11,13,15,17
    }))
    // Course handicap de 9h = 9 → debe repartir exactamente 9 golpes.
    const r = computeIndividualScore(played(9, 5), holes9, 9, 9)

    expect(r.grossTotal).toBe(45)
    expect(r.netTotal).toBe(36) // 45 − 9 golpes repartidos
  })
})

describe('computeIndividualScore — 9 hoyos', () => {
  it('par jugado tope a 9 hoyos', () => {
    const holes9 = HOLES_18.slice(0, 9)
    const r = computeIndividualScore(played(9, 4), holes9, 0, 9)

    expect(r.parPlayed).toBe(36)
    expect(r.vsParGross).toBe(0)
    expect(r.holesPlayed).toBe(9)
  })

  it('ignora scores de hoyos fuera del rango de la ronda', () => {
    const holes9 = HOLES_18.slice(0, 9)
    const r = computeIndividualScore(played(18, 4), holes9, 0, 9)

    expect(r.holesPlayed).toBe(9)
    expect(r.grossTotal).toBe(36)
  })
})

describe('computeIndividualScore — stableford', () => {
  it('par = 2 puntos por hoyo con hcp 0', () => {
    const r = computeIndividualScore(played(9, 4), HOLES_18, 0, 18)

    expect(r.stablefordTotal).toBe(18) // 9 hoyos × 2
    expect(r.stablefordScores.slice(0, 9)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2])
  })

  it('hoyos sin jugar valen 0 puntos, no negativo', () => {
    const r = computeIndividualScore({ '1': 4 }, HOLES_18, 0, 18)

    expect(r.stablefordTotal).toBe(2)
    expect(r.stablefordScores[17]).toBe(0)
  })
})

describe('computeIndividualScore — acepta array además de mapa', () => {
  it('array indexado desde 0 equivale al mapa 1-based', () => {
    const arr = [4, 4, 4, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
    const porMapa = computeIndividualScore({ '1': 4, '2': 4, '3': 4 }, HOLES_18, 0, 18)
    const porArray = computeIndividualScore(arr, HOLES_18, 0, 18)

    expect(porArray.grossTotal).toBe(porMapa.grossTotal)
    expect(porArray.parPlayed).toBe(porMapa.parPlayed)
    expect(porArray.vsParGross).toBe(porMapa.vsParGross)
  })
})

describe('sumIndividualScores — multi-ronda', () => {
  it('acumula par jugado de cada ronda (no par de cancha × rondas)', () => {
    const r1 = computeIndividualScore(played(18, 4), HOLES_18, 0, 18) // completa, E
    const r2 = computeIndividualScore(played(9, 4), HOLES_18, 0, 18)  // mitad, E

    const total = sumIndividualScores([r1, r2])

    expect(total.holesPlayed).toBe(27)
    expect(total.parPlayed).toBe(108) // 72 + 36, no 144
    expect(total.grossTotal).toBe(108)
    expect(total.vsParGross).toBe(0)
    expect(total.hasData).toBe(true)
  })

  it('rondas sin datos no aportan par', () => {
    const r1 = computeIndividualScore(played(18, 4), HOLES_18, 0, 18)
    const vacia = computeIndividualScore({}, HOLES_18, 0, 18)

    const total = sumIndividualScores([r1, vacia])

    expect(total.parPlayed).toBe(72)
    expect(total.vsParGross).toBe(0)
  })

  it('lista vacía → EMPTY_SCORE', () => {
    const total = sumIndividualScores([])

    expect(total.hasData).toBe(false)
    expect(total.parPlayed).toBe(0)
  })
})

describe('formatScoreVsPar — vacío nunca se pinta como score', () => {
  it('sin datos muestra em dash, no "E" ni "0"', () => {
    expect(formatScoreVsPar(0, false)).toBe('—')
    expect(formatScoreVsPar(-36, false)).toBe('—')
  })

  it('con datos usa la convención de golf', () => {
    expect(formatScoreVsPar(0, true)).toBe('E')
    expect(formatScoreVsPar(3, true)).toBe('+3')
    expect(formatScoreVsPar(-2, true)).toBe('−2') // menos tipográfico U+2212
  })
})
