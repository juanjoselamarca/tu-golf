// src/lib/data/course-aptitud.test.ts
//
// El gate de creación de torneos. `evaluarAptitudTorneo` ya está testeado como
// función pura; acá se prueba el pegamento: que las filas de la BD se junten
// bien y que el gate mire la ronda correcta.

import { describe, it, expect } from 'vitest'
import {
  armarCanchasParaAptitud,
  aptitudDeCatalogo,
  canchasNoAptasParaTorneo,
  fetchCanchasParaAptitud,
  fetchTeesParaAptitud,
  type CourseRowParaAptitud,
  type TeeRowParaAptitud,
} from './course-aptitud'
import { MENSAJE_SIN_RATING_9H } from '@/golf/courses/aptitud-torneo'

const RIO_BLANCO = 'rio-blanco-varones'
const LOS_LEONES = 'los-leones'

const COURSES: CourseRowParaAptitud[] = [
  // Caso real: par de 9 hoyos con el rating de 18 en los tees.
  { id: RIO_BLANCO, nombre: 'C.G. Rio Blanco (VARONES)', par_total: 35, course_rating: null },
  { id: LOS_LEONES, nombre: 'Club de Golf Los Leones', par_total: 72, course_rating: 71.6 },
]

const TEES: TeeRowParaAptitud[] = [
  { course_id: RIO_BLANCO, rating: 55, front_course_rating: null },
  { course_id: RIO_BLANCO, rating: 55, front_course_rating: null },
  { course_id: LOS_LEONES, rating: 73.1, front_course_rating: 37.2 },
  { course_id: 'cancha-que-no-pedimos', rating: 70, front_course_rating: null },
]

/**
 * Fake mínimo del query builder de supabase-js: `.select()`, `.in()` y
 * `.range()` devuelven `this`, y el objeto es thenable. Registra las tablas
 * consultadas para poder afirmar que no se hacen consultas de más.
 */
function fakeSupabase(
  filas: Record<string, unknown[]>,
  registro: string[] = [],
) {
  return {
    consultas: registro,
    from(tabla: string) {
      registro.push(tabla)
      const builder = {
        select: () => builder,
        in: () => builder,
        range: () => builder,
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: filas[tabla] ?? [], error: null }),
      }
      return builder as never
    },
  }
}

describe('armarCanchasParaAptitud', () => {
  it('cuelga cada tee de su cancha y descarta los huérfanos', () => {
    const m = armarCanchasParaAptitud(COURSES, TEES)
    expect(m.size).toBe(2)
    expect(m.get(RIO_BLANCO)!.tees).toHaveLength(2)
    expect(m.get(LOS_LEONES)!.tees).toHaveLength(1)
    expect(m.has('cancha-que-no-pedimos')).toBe(false)
  })

  it('una cancha sin tees queda con la lista vacía, no undefined', () => {
    const m = armarCanchasParaAptitud([COURSES[0]], [])
    expect(m.get(RIO_BLANCO)!.tees).toEqual([])
  })
})

describe('aptitudDeCatalogo', () => {
  it('marca Río Blanco no apta y Los Leones apta, a 9 y a 18', () => {
    const a = aptitudDeCatalogo(COURSES, TEES)
    expect(a.get(RIO_BLANCO)![9].apta).toBe(false)
    expect(a.get(RIO_BLANCO)![9].mensaje).toBe(MENSAJE_SIN_RATING_9H)
    expect(a.get(RIO_BLANCO)![18].apta).toBe(false)
    expect(a.get(LOS_LEONES)![9].apta).toBe(true)
    expect(a.get(LOS_LEONES)![18].apta).toBe(true)
  })

  it('devuelve un veredicto por cada cancha del catálogo', () => {
    expect(aptitudDeCatalogo(COURSES, TEES).size).toBe(COURSES.length)
  })
})

describe('fetchCanchasParaAptitud', () => {
  it('junta courses + course_tees en un solo Map', async () => {
    const m = await fetchCanchasParaAptitud(
      fakeSupabase({ courses: COURSES, course_tees: TEES }),
      [RIO_BLANCO, LOS_LEONES],
    )
    expect(m.get(RIO_BLANCO)!.par_total).toBe(35)
    expect(m.get(RIO_BLANCO)!.tees).toHaveLength(2)
  })

  it('sin ids no consulta la BD', async () => {
    const consultas: string[] = []
    const m = await fetchCanchasParaAptitud(fakeSupabase({}, consultas), [])
    expect(m.size).toBe(0)
    expect(consultas).toEqual([])
  })

  it('ignora ids nulos y repetidos', async () => {
    const consultas: string[] = []
    await fetchCanchasParaAptitud(
      fakeSupabase({ courses: COURSES, course_tees: TEES }, consultas),
      [RIO_BLANCO, RIO_BLANCO, null as unknown as string],
    )
    expect(consultas.sort()).toEqual(['course_tees', 'courses'])
  })
})

describe('fetchTeesParaAptitud', () => {
  it('trae los tees del catálogo', async () => {
    const tees = await fetchTeesParaAptitud(fakeSupabase({ course_tees: TEES }))
    expect(tees).toHaveLength(TEES.length)
  })
})

describe('canchasNoAptasParaTorneo — el gate del servidor', () => {
  const supabase = () => fakeSupabase({ courses: COURSES, course_tees: TEES })

  it('bloquea la ronda cuya cancha tiene el rating en escala equivocada', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: RIO_BLANCO, hole_count: 9 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].round_number).toBe(1)
    expect(r[0].cancha).toContain('Rio Blanco')
    expect(r[0].mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('deja pasar un torneo entero sobre canchas sanas', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: LOS_LEONES, hole_count: 18 },
      { round_number: 2, course_id: LOS_LEONES, hole_count: 9 },
    ])
    expect(r).toEqual([])
  })

  it('revisa TODAS las rondas, no sólo la primera', async () => {
    // El wizard sólo persiste hole_count de la ronda 1; el gate igual tiene que
    // mirar la cancha de cada una.
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: LOS_LEONES, hole_count: 18 },
      { round_number: 2, course_id: RIO_BLANCO, hole_count: 9 },
      { round_number: 3, course_id: LOS_LEONES, hole_count: 18 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].round_number).toBe(2)
  })

  it('una ronda sin cancha no es asunto de este gate', async () => {
    const consultas: string[] = []
    const r = await canchasNoAptasParaTorneo(fakeSupabase({}, consultas), [
      { round_number: 1, course_id: null, hole_count: 18 },
    ])
    expect(r).toEqual([])
    expect(consultas).toEqual([])
  })

  it('una cancha que no existe en la BD no bloquea (de eso se ocupa la FK)', async () => {
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase({ courses: [], course_tees: [] }),
      [{ round_number: 1, course_id: 'fantasma', hole_count: 18 }],
    )
    expect(r).toEqual([])
  })

  it('numera la ronda por posición cuando no viene round_number', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { course_id: RIO_BLANCO, hole_count: 9 },
    ])
    expect(r[0].round_number).toBe(1)
  })
})
