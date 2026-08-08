// src/golf/core/handicap-display-ronda.test.ts
//
// `resolverHandicapDisplayDeRonda` es la fuente única del número que el jugador
// LEE como "su handicap". Cuelgan de ella las tres pantallas de ronda libre y el
// board de torneo.
//
// El invariante que protege: el HCP que se MUESTRA es SIEMPRE el de 18 hoyos,
// aunque la vuelta sea de 9 (donde se PUNTÚA con la mitad). Cruzar los dos es
// exactamente la regresión que motivó extraer esta función: `score-grupo` le
// mostraba "HCP 8" a un jugador de índice 15.

import { describe, it, expect, vi } from 'vitest'
import {
  resolverHandicapDisplayDeRonda,
  type CourseData,
  type CargadorDeCourseData,
} from './course-handicap'

/** Ronda de 9 sobre una cancha de 18: el CourseData con el que se puntúa. */
const cd9: CourseData = { slope: 130, courseRating: 35.75, par: 36, is9Hole: true }
/** El mismo tee en 18 hoyos: el que hay que MOSTRAR. */
const cd18: CourseData = { slope: 130, courseRating: 71.5, par: 72 }

const INDICE = 15

/** Cargador espía: devuelve `cd18` y cuenta con qué argumentos lo llamaron. */
function cargadorEspia(resultado: CourseData | null = cd18) {
  const llamadas: Array<[string | null, string, number, number | undefined]> = []
  const cargar: CargadorDeCourseData = vi.fn(async (courseId, tee, holes, parTotal) => {
    llamadas.push([courseId, tee, holes, parTotal])
    return resultado
  })
  return { cargar, llamadas }
}

const ronda = (over: Partial<Parameters<typeof resolverHandicapDisplayDeRonda>[2]> = {}) => ({
  courseId: 'cancha-1',
  tee: 'azul',
  finalParTotal: 72,
  tieneRecorridos: false,
  ...over,
})

describe('resolverHandicapDisplayDeRonda — el HCP que ve el jugador', () => {
  it('vuelta de 9: muestra el handicap de 18 hoyos, no la mitad', async () => {
    const { cargar, llamadas } = cargadorEspia()
    const display = await resolverHandicapDisplayDeRonda(
      INDICE, cd9, ronda(), new Map(), cargar,
    )
    // round(15 × 130/113 + (71.5 − 72)) = round(17.26 − 0.5) = 17.
    expect(display).toBe(17)
    // Y va a buscar los ratings de 18h del MISMO tee.
    expect(llamadas).toEqual([['cancha-1', 'azul', 18, 72]])
  })

  it('el número que se muestra NO es el que reparte golpes', async () => {
    const { cargar } = cargadorEspia()
    const display = await resolverHandicapDisplayDeRonda(
      INDICE, cd9, ronda(), new Map(), cargar,
    )
    // Puntuando: round(7.5 × 130/113 − 0.25) = 8. Mostrando: 17.
    // Si algún día estos dos números coinciden, el invariante se rompió.
    expect(display).not.toBe(8)
    expect(display).toBe(17)
  })

  it('vuelta de 18: no consulta nada, el CourseData que llega ya es el bueno', async () => {
    const { cargar, llamadas } = cargadorEspia()
    const display = await resolverHandicapDisplayDeRonda(
      INDICE, cd18, ronda(), new Map(), cargar,
    )
    expect(display).toBe(17)
    expect(llamadas).toEqual([])
  })

  it('cancha multi-recorrido: no se puede derivar el par de 18h → índice entero', async () => {
    // `finalParTotal` es el par del LOOP (~36), no el de la cancha completa.
    // Inventar un CourseData de 18h desde ahí daría un número inflado.
    const { cargar, llamadas } = cargadorEspia()
    const display = await resolverHandicapDisplayDeRonda(
      INDICE, cd9, ronda({ tieneRecorridos: true, finalParTotal: 36 }), new Map(), cargar,
    )
    expect(display).toBe(15) // round(index)
    expect(llamadas).toEqual([])
  })

  it('sin cancha vinculada tampoco inventa: índice entero', async () => {
    const { cargar } = cargadorEspia()
    const display = await resolverHandicapDisplayDeRonda(
      INDICE, null, ronda({ courseId: null }), new Map(), cargar,
    )
    expect(display).toBe(15)
  })

  it('la consulta se hace UNA vez por cancha+tee, aunque jueguen varios', async () => {
    const { cargar, llamadas } = cargadorEspia()
    const cache = new Map<string, CourseData | null>()
    for (const idx of [15, 20, 8]) {
      await resolverHandicapDisplayDeRonda(idx, cd9, ronda(), cache, cargar)
    }
    expect(llamadas).toHaveLength(1)
  })

  it('el cache distingue CANCHAS, no sólo tees', async () => {
    // Un torneo puede tener rondas en canchas distintas con el mismo nombre de
    // tee. Cachear sólo por tee devolvería el CourseData de la otra cancha.
    const { cargar, llamadas } = cargadorEspia()
    const cache = new Map<string, CourseData | null>()
    await resolverHandicapDisplayDeRonda(INDICE, cd9, ronda(), cache, cargar)
    await resolverHandicapDisplayDeRonda(
      INDICE, cd9, ronda({ courseId: 'cancha-2' }), cache, cargar,
    )
    expect(llamadas.map((l) => l[0])).toEqual(['cancha-1', 'cancha-2'])
  })

  it('si la cancha de 18h no aparece, cae al índice en vez de romper', async () => {
    const { cargar, llamadas } = cargadorEspia(null)
    const cache = new Map<string, CourseData | null>()
    expect(await resolverHandicapDisplayDeRonda(INDICE, cd9, ronda(), cache, cargar)).toBe(15)
    // Y el `null` queda cacheado: no se reintenta por cada jugador.
    await resolverHandicapDisplayDeRonda(INDICE, cd9, ronda(), cache, cargar)
    expect(llamadas).toHaveLength(1)
  })

  it('un rating de 18h que MIENTE no se muestra: el guardarrail también aplica acá', async () => {
    // C.G. Río Blanco: par 35 con rating 55 cargado en escala de 18.
    const rioBlanco18h: CourseData = { slope: 113, courseRating: 55, par: 35 }
    const { cargar } = cargadorEspia(rioBlanco18h)
    const display = await resolverHandicapDisplayDeRonda(
      12,
      { slope: 113, courseRating: 55, par: 35, is9Hole: true },
      ronda(),
      new Map(),
      cargar,
    )
    // Sin guardarrail: round(12 + (55 − 35)) = 32 golpes de handicap mostrado.
    expect(display).toBe(12)
  })
})
