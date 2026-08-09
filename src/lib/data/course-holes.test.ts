// src/lib/data/course-holes.test.ts
//
// La fuente única de "los hoyos de esta ronda". Casos tomados del catálogo real
// (snapshot 09-ago-2026).

import { describe, it, expect } from 'vitest'
import { fetchHoyosDeLaRonda, COLUMNAS_HOYOS } from './course-holes'
import { ordenarHoyosDeLosRecorridos } from '@/golf/courses/hoyos-de-la-ronda'

const BRISAS_PADRE = 'brisas-padre'

/** 9 hoyos de un recorrido, con pares que NO son todos 4 (ahí está la gracia). */
function nueve(recorrido: string, pares: number[]) {
  return pares.map((par, i) => ({
    numero: i + 1,
    par,
    stroke_index: i + 1,
    recorrido,
    course_id: recorrido.toLowerCase(),
  }))
}

const PARES_NORTE = [4, 3, 5, 4, 4, 3, 4, 5, 4] // par 36
const PARES_SUR = [5, 4, 3, 4, 4, 4, 3, 4, 5] // par 36

/**
 * Fake del query builder de supabase-js. `.eq()` / `.in()` filtran de verdad;
 * `.order()` es no-op salvo por la columna, que se ignora a propósito: lo que
 * se prueba es que el ORDEN FINAL lo decida nuestro código y no PostgREST.
 */
function fakeSupabase(filas: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(tabla: string) {
      let resultado = (filas[tabla] ?? []).slice()
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          resultado = resultado.filter((f) => f[col] === val)
          return builder
        },
        in: (col: string, vals: unknown[]) => {
          resultado = resultado.filter((f) => vals.includes(f[col]))
          return builder
        },
        order: () => builder,
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: resultado, error: null }),
      }
      return builder as never
    },
  }
}

/** Brisas tal como está en producción: 0 hoyos en el padre, 9 en cada hijo. */
const CATALOGO_BRISAS = {
  courses: [
    { id: BRISAS_PADRE, loop_nombre: null, parent_id: null },
    { id: 'norte', loop_nombre: 'Norte', parent_id: BRISAS_PADRE },
    { id: 'sur', loop_nombre: 'Sur', parent_id: BRISAS_PADRE },
    { id: 'este', loop_nombre: 'Este', parent_id: BRISAS_PADRE },
  ],
  course_holes: [...nueve('Norte', PARES_NORTE), ...nueve('Sur', PARES_SUR)],
}

describe('fetchHoyosDeLaRonda — vía 1: la cancha tiene sus propios hoyos', () => {
  const LOS_LEONES = {
    courses: [{ id: 'los-leones', loop_nombre: null, parent_id: null }],
    course_holes: nueve('default', PARES_NORTE).map((h) => ({ ...h, course_id: 'los-leones' })),
  }

  it('devuelve los hoyos de la cancha, con su numeración original', async () => {
    const h = await fetchHoyosDeLaRonda(fakeSupabase(LOS_LEONES), 'los-leones', null)
    expect(h).toHaveLength(9)
    expect(h.map((x) => x.par)).toEqual(PARES_NORTE)
    expect(h.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('una cancha sin hoyos y sin recorridos devuelve vacío, no explota', async () => {
    const h = await fetchHoyosDeLaRonda(
      fakeSupabase({ courses: [{ id: 'iquique', parent_id: null }], course_holes: [] }),
      'iquique',
      null,
    )
    expect(h).toEqual([])
  })
})

describe('fetchHoyosDeLaRonda — vía 2: los hoyos cuelgan de los recorridos hijos', () => {
  it('encuentra los 18 hoyos de Brisas Norte+Sur, que antes daban CERO', async () => {
    // Éste es el bug: la query vieja hacía `course_id = padre` y PostgREST
    // devolvía 0 filas, así que el scorer pintaba 18 hoyos par 4.
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Norte', 'Sur'])
    expect(h).toHaveLength(18)
    expect(h.map((x) => x.par)).toEqual([...PARES_NORTE, ...PARES_SUR])
  })

  it('renumera 1..18 para que los dos hoyos "1" no se pisen', async () => {
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Norte', 'Sur'])
    expect(h.map((x) => x.numero)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('el ORDEN lo manda la selección, no el alfabeto', async () => {
    // `['Sur','Norte']` tiene que devolver Sur primero. La query vieja hacía
    // `.order('recorrido')` y habría puesto Norte adelante, numerando los hoyos
    // al revés de como se jugaron.
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Sur', 'Norte'])
    expect(h.map((x) => x.par)).toEqual([...PARES_SUR, ...PARES_NORTE])
    expect(h[0].recorrido).toBe('Sur')
    expect(h[9].recorrido).toBe('Norte')
  })

  it('un solo recorrido conserva la numeración 1..9 del catálogo', async () => {
    // Con un loop la ronda de 18 se resuelve repitiendo la vuelta
    // (`@/golf/courses/vueltas`), así que renumerar acá sería doble conteo.
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Norte'])
    expect(h).toHaveLength(9)
    expect(h.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(h.map((x) => x.par)).toEqual(PARES_NORTE)
  })

  it('un recorrido elegido sin hoyos cargados no inventa: devuelve sólo lo que hay', async () => {
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Norte', 'Este'])
    expect(h.map((x) => x.recorrido)).toEqual(Array(9).fill('Norte'))
  })

  it('sin recorridos elegidos no se adivina cuál de los tres nueves se jugó', async () => {
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, null)
    expect(h).toEqual([])
  })

  it('conserva el stroke index de cada hoyo, que es lo que reparte los golpes', async () => {
    const h = await fetchHoyosDeLaRonda(fakeSupabase(CATALOGO_BRISAS), BRISAS_PADRE, ['Norte', 'Sur'])
    // El default del scorer era `stroke_index = i`, o sea 1..18 secuencial.
    // El real viene del catálogo y NO es secuencial entre loops.
    expect(h.map((x) => x.stroke_index)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })
})

describe('COLUMNAS_HOYOS — el SELECT canónico', () => {
  it('pide lo que el scorer necesita para pintar la tarjeta', () => {
    for (const col of ['numero', 'par', 'stroke_index', 'recorrido', 'yardaje_verificado_at']) {
      expect(COLUMNAS_HOYOS).toContain(col)
    }
  })
})

describe('ordenarHoyosDeLosRecorridos — la parte pura', () => {
  it('un loop ausente del mapa se omite sin romper el resto', () => {
    const mapa = new Map([['Norte', nueve('Norte', PARES_NORTE)]])
    const h = ordenarHoyosDeLosRecorridos(mapa, ['Norte', 'Sur'])
    expect(h).toHaveLength(9)
  })

  it('sin recorridos devuelve vacío', () => {
    expect(ordenarHoyosDeLosRecorridos(new Map(), [])).toEqual([])
  })
})
