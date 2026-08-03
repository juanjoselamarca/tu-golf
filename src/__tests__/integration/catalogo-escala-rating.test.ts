// Canario del catálogo: ¿cada rating cierra en alguna escala?
//
// `courseRatingEnEscalaDe9` clasifica un rating en tres ramas — "ya viene en 9",
// "viene en 18" o "imposible" (ninguna hipótesis cierra dentro de la banda).
// La tercera degrada el handicap a la parte del índice, sin el término del
// rating. Es una degradación segura, pero MUDA: una cancha nueva cargada mal
// entra en silencio y sirve handicaps aproximados para siempre.
//
// Este test corre las 600+ filas del catálogo REAL por la función y fija el
// conjunto "imposible" en lo que hoy conocemos. Si mañana entra otra cancha
// rota, salta acá en vez de en un torneo.
//
// Read-only. Skipea sin SUPABASE_SERVICE_ROLE_KEY.
// Correr: npm run test:integration

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { courseRatingEnEscalaDe9, parEnEscalaDe9 } from '@/golf/core/course-handicap'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasCreds = Boolean(supabaseUrl && supabaseKey)

/** Ratings que hoy no cierran en ninguna escala. C.G. Río Blanco: par 35 con
 *  rating 55 repetido igual en sus 4 tees y slope 113 neutro — firma de carga a
 *  mano, no de una medición. Se fija el CONJUNTO, no la cantidad: si sólo se
 *  contara, arreglar Río Blanco y romper otra cancha el mismo día pasaría en
 *  verde. */
const IMPOSIBLES_CONOCIDOS = [
  'course_tees · C.G. Rio Blanco - Rio Blanco (DAMAS) / rojo',
  'course_tees · C.G. Rio Blanco - Rio Blanco (VARONES) / azul',
  'course_tees · C.G. Rio Blanco - Rio Blanco (VARONES) / blanco',
  'course_tees · C.G. Rio Blanco - Rio Blanco (VARONES) / rojo',
]

interface Fila {
  etiqueta: string
  rating: number
  parDeLaCancha: number
}

const filas: Fila[] = []
const loadErrors: string[] = []

describe.skipIf(!hasCreds)('catálogo — todo rating cierra en alguna escala', () => {
  beforeAll(async () => {
    try {
      const sb = createClient(supabaseUrl as string, supabaseKey as string)

      // TODAS las canchas con par, tengan rating o no: los tees necesitan el par
      // de SU cancha como señal de escala. Filtrando por rating se pierde el par
      // de las canchas que sólo lo tienen a nivel tee (C.G. Río Blanco), y sus
      // tees caerían al default de 72 — clasificándolos mal.
      const { data: courses, error: cErr } = await sb
        .from('courses')
        .select('id, nombre, par_total, course_rating')
        .not('par_total', 'is', null)
      if (cErr) throw new Error(`courses: ${cErr.message}`)

      const parPorCancha = new Map<string, number>()
      const nombrePorCancha = new Map<string, string>()
      for (const c of (courses ?? []) as Array<{ id: string; nombre: string; par_total: number; course_rating: number | null }>) {
        parPorCancha.set(c.id, c.par_total)
        nombrePorCancha.set(c.id, c.nombre)
        if (c.course_rating != null) {
          filas.push({ etiqueta: `courses · ${c.nombre}`, rating: c.course_rating, parDeLaCancha: c.par_total })
        }
      }

      // Los tees sin par propio caen al de su cancha; sin cancha, 72 (el mismo
      // default que usa `resolverCourseData`).
      const { data: tees, error: tErr } = await sb
        .from('course_tees')
        .select('course_id, nombre, rating')
        .not('rating', 'is', null)
      if (tErr) throw new Error(`course_tees: ${tErr.message}`)

      for (const t of (tees ?? []) as Array<{ course_id: string; nombre: string; rating: number }>) {
        filas.push({
          // Nombre del club, no el UUID: el día que salte se tiene que leer solo.
          etiqueta: `course_tees · ${nombrePorCancha.get(t.course_id) ?? t.course_id} / ${t.nombre}`,
          rating: t.rating,
          parDeLaCancha: parPorCancha.get(t.course_id) ?? 72,
        })
      }
    } catch (err) {
      loadErrors.push(err instanceof Error ? err.message : String(err))
    }
  }, 60_000)

  it('la carga desde prod no tuvo errores y trajo filas', () => {
    expect(loadErrors).toEqual([])
    expect(filas.length, 'catálogo vacío — el canario estaría pasando en vacío').toBeGreaterThan(100)
  })

  it('el resultado SIEMPRE queda a menos de 6 golpes del par (nunca envenena la fórmula)', () => {
    for (const f of filas) {
      const par9 = parEnEscalaDe9(f.parDeLaCancha)
      const cr9 = courseRatingEnEscalaDe9(f.rating, f.parDeLaCancha)
      expect(Math.abs(cr9 - par9), `${f.etiqueta}: rating ${f.rating} vs par ${f.parDeLaCancha}`)
        .toBeLessThanOrEqual(6)
    }
  })

  it('la cantidad de ratings imposibles es la conocida (si sube, entró data rota)', () => {
    const imposibles = filas.filter((f) => {
      const par9 = parEnEscalaDe9(f.parDeLaCancha)
      return courseRatingEnEscalaDe9(f.rating, f.parDeLaCancha) === par9
        && Math.abs(f.rating - par9) > 6
        && Math.abs(f.rating / 2 - par9) > 6
    })
    expect(imposibles.map((f) => f.etiqueta).sort(), 'cambió el conjunto de ratings imposibles')
      .toEqual(IMPOSIBLES_CONOCIDOS)
  })

  it('ningún jugador de índice 12 recibe golpes NEGATIVOS en 9 hoyos, en ninguna cancha', () => {
    // Cero golpes sí es posible y correcto: una cancha muy fácil (par 72 con
    // rating 60.3, un tee adelantado corto) tiene `(CR9 − par9) ≈ −5.9`, y un
    // índice 12 recibe 6 en 9 hoyos. Se cancelan. Lo que NUNCA puede pasar es
    // que el jugador DEVUELVA golpes sin ser plus — ese era el síntoma del bug
    // de escala por el lado negativo.
    for (const f of filas) {
      const par9 = parEnEscalaDe9(f.parDeLaCancha)
      const cr9 = courseRatingEnEscalaDe9(f.rating, f.parDeLaCancha)
      const ch = Math.round(6 * (113 / 113) + (cr9 - par9))
      expect(ch, `${f.etiqueta}: rating ${f.rating} vs par ${f.parDeLaCancha}`).toBeGreaterThanOrEqual(0)
    }
  })
})
