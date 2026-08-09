// src/lib/data/course-aptitud.test.ts
//
// El gate de creación de torneos. `evaluarAptitudTorneo` ya está testeado como
// función pura; acá se prueba el pegamento: que las filas de la BD se junten
// bien y que el gate mire la ronda correcta.

import { describe, it, expect } from 'vitest'
import {
  armarCanchasParaAptitud,
  aptitudDeCatalogo,
  COLUMNAS_APTITUD_COURSES,
  canchasNoAptasParaTorneo,
  evaluarCanchaDeRondaLibre,
  fetchCanchasParaAptitud,
  fetchTeesParaAptitud,
  fetchParPorHoyoDisponible,
  evaluarRondaLibre,
  type CourseRowParaAptitud,
  type TeeRowParaAptitud,
} from './course-aptitud'
import {
  MENSAJE_SIN_RATING_9H,
  bloqueaRondaLibre,
  evaluarParPorHoyo,
} from '@/golf/courses/aptitud-torneo'

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

/** Un torneo que SÍ necesita el rating de la cancha. */
const NETO = { modo: 'neto', use_handicap: true }

/**
 * Fake mínimo del query builder de supabase-js: `.select()`, `.in()`, `.eq()` y
 * `.range()` devuelven `this`, y el objeto es thenable. Registra las tablas
 * consultadas para poder afirmar que no se hacen consultas de más.
 *
 * `fallaEn` simula el modo de falla real de supabase-js: NO lanza, devuelve
 * `{ data: null, error }`.
 */
function fakeSupabase(
  filas: Record<string, unknown[]>,
  registro: string[] = [],
  fallaEn?: string,
) {
  return {
    consultas: registro,
    from(tabla: string) {
      registro.push(tabla)
      const todas = (filas[tabla] ?? []) as Array<Record<string, unknown>>
      let resultado = todas
      // `.eq()` / `.in()` filtran DE VERDAD, pero sólo por columnas que los
      // fixtures declaran. Los fixtures viejos no traen `parent_id` ni
      // `loop_nombre` (el fake original ignoraba los filtros y devolvía todo),
      // así que un filtro sobre una columna que nadie declara se deja pasar en
      // vez de vaciar el resultado. Los fixtures que sí la declaran obtienen el
      // filtrado real, que es lo que necesitan las consultas que distinguen
      // padre de hijos.
      //
      // Se mide sobre el fixture COMPLETO, no sobre el resultado ya filtrado:
      // si un `.eq()` previo dejara sólo filas donde la segunda columna es
      // `undefined`, el segundo filtro se saltearía entero y el test pasaría
      // por la razón equivocada.
      const filtrable = (col: string) => todas.some((f) => f[col] !== undefined)
      const builder = {
        select: () => builder,
        in: (col: string, vals: unknown[]) => {
          if (filtrable(col)) resultado = resultado.filter((f) => vals.includes(f[col]))
          return builder
        },
        eq: (col: string, val: unknown) => {
          if (filtrable(col)) resultado = resultado.filter((f) => f[col] === val)
          return builder
        },
        range: () => builder,
        // No-op a propósito: el orden final lo decide nuestro código, no
        // PostgREST (ver `fetchHoyosDeLaRonda`). Un fake que ordenara acá
        // taparía justamente el bug del orden alfabético.
        order: () => builder,
        then: (resolve: (r: { data: unknown[] | null; error: { message: string } | null }) => unknown) =>
          resolve(
            tabla === fallaEn
              ? { data: null, error: { message: 'timeout' } }
              : { data: resultado, error: null },
          ),
      }
      return builder as never
    },
  }
}

describe('COLUMNAS_APTITUD_COURSES — el SELECT canónico', () => {
  it('pide slope_rating: sin él, el eslabón de cancha queda muerto y el veredicto cambia', () => {
    // `armarCanchasParaAptitud` normaliza el campo ausente a null, y null
    // significa "el motor no puede usar este eslabón". Si alguien saca la
    // columna del SELECT, el gate empieza a contestar otra cosa en silencio.
    expect(COLUMNAS_APTITUD_COURSES).toContain('slope_rating')
    expect(COLUMNAS_APTITUD_COURSES).toContain('course_rating')
    expect(COLUMNAS_APTITUD_COURSES).toContain('par_total')
  })
})

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
  // Las dos canchas tienen sus `course_holes` cargados, como en producción: lo
  // que este describe prueba es el eslabón del RATING, no el del par por hoyo.
  const HOYOS = [
    ...Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null, course_id: RIO_BLANCO })),
    ...Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null, course_id: LOS_LEONES })),
  ]
  const supabase = () => fakeSupabase({ courses: COURSES, course_tees: TEES, course_holes: HOYOS })

  it('bloquea la ronda cuya cancha tiene el rating en escala equivocada', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: RIO_BLANCO, hole_count: 9 },
    ], NETO)
    expect(r).toHaveLength(1)
    expect(r[0].round_number).toBe(1)
    expect(r[0].cancha).toContain('Rio Blanco')
    expect(r[0].mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('deja pasar un torneo entero sobre canchas sanas', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: LOS_LEONES, hole_count: 18 },
      { round_number: 2, course_id: LOS_LEONES, hole_count: 9 },
    ], NETO)
    expect(r).toEqual([])
  })

  it('revisa TODAS las rondas, no sólo la primera', async () => {
    // El wizard sólo persiste hole_count de la ronda 1; el gate igual tiene que
    // mirar la cancha de cada una.
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { round_number: 1, course_id: LOS_LEONES, hole_count: 18 },
      { round_number: 2, course_id: RIO_BLANCO, hole_count: 9 },
      { round_number: 3, course_id: LOS_LEONES, hole_count: 18 },
    ], NETO)
    expect(r).toHaveLength(1)
    expect(r[0].round_number).toBe(2)
  })

  it('una ronda sin cancha no es asunto de este gate', async () => {
    const consultas: string[] = []
    const r = await canchasNoAptasParaTorneo(fakeSupabase({}, consultas), [
      { round_number: 1, course_id: null, hole_count: 18 },
    ], NETO)
    expect(r).toEqual([])
    expect(consultas).toEqual([])
  })

  it('una cancha que no existe en la BD no bloquea (de eso se ocupa la FK)', async () => {
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase({ courses: [], course_tees: [] }),
      [{ round_number: 1, course_id: 'fantasma', hole_count: 18 }],
      NETO,
    )
    expect(r).toEqual([])
  })

  it('numera la ronda por posición cuando no viene round_number', async () => {
    const r = await canchasNoAptasParaTorneo(supabase(), [
      { course_id: RIO_BLANCO, hole_count: 9 },
    ], NETO)
    expect(r[0].round_number).toBe(1)
  })

  it('un torneo Gross no se bloquea por el rating, y no pide los tees', async () => {
    // El Course Rating no entra en ningún cálculo de un torneo a golpes brutos.
    // Bloquearlo sería un falso bloqueo sobre canchas que sirven perfecto.
    //
    // Sí se consulta la BD: desde el 09-ago-2026 el par hoyo por hoyo se juzga
    // en los dos modos. Lo que NO se pide es `course_tees`, que es el fetch
    // caro y sólo sirve para el veredicto de rating.
    const consultas: string[] = []
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase({ courses: COURSES, course_tees: TEES, course_holes: HOYOS }, consultas),
      [{ round_number: 1, course_id: RIO_BLANCO, hole_count: 9 }],
      { modo: 'gross', use_handicap: false },
    )
    expect(r).toEqual([])
    expect(consultas).not.toContain('course_tees')
  })

  it('un torneo Gross CON handicap sí se bloquea (hay premios neto)', async () => {
    const r = await canchasNoAptasParaTorneo(
      supabase(),
      [{ round_number: 1, course_id: RIO_BLANCO, hole_count: 9 }],
      { modo: 'gross', use_handicap: true },
    )
    expect(r).toHaveLength(1)
  })

  it('si la BD falla, el gate falla CERRADO (no deja crear a ciegas)', async () => {
    // supabase-js no lanza en error de query: devuelve data null. Tragarse eso
    // haría que un timeout se lea como "cancha sin ratings" → torneo creado.
    await expect(
      canchasNoAptasParaTorneo(
        fakeSupabase({ courses: COURSES, course_tees: TEES }, [], 'course_tees'),
        [{ round_number: 1, course_id: RIO_BLANCO, hole_count: 9 }],
        NETO,
      ),
    ).rejects.toThrow(/no se pudo leer/i)
  })
})

describe('evaluarCanchaDeRondaLibre — recorridos sueltos', () => {
  // El selector sólo ofrece la cancha PADRE (sana) y los loops viajan aparte.
  const PADRE = 'brisas-padre'
  // `slope_rating` va en todos los fixtures porque va en todas las filas reales
  // (0 canchas activas lo tienen nulo). Sin él, el eslabón de cancha está muerto
  // para el motor y el veredicto no lo mira — que es correcto, pero no es el
  // caso que estas pruebas quieren describir.
  const CATALOGO = {
    courses: [
      { id: PADRE, nombre: 'Club de Golf Brisas de Santo Domingo', par_total: 72, course_rating: 72.6, slope_rating: 130 },
    ],
    course_tees: [],
  }
  // Rating IMPOSIBLE sobre par 36: +19 si ya fuera de 9, −8.5 si fuera de 18.
  // Un 72 acá NO sirve de fixture — ése es el rating de 18 hoyos del loop y el
  // motor lo recupera partiéndolo (#293), así que el gate lo deja pasar a
  // propósito. Ver el caso de abajo.
  const HIJOS = {
    courses: [
      { id: 'este', nombre: 'Este', par_total: 36, course_rating: 55, slope_rating: 130 },
      { id: 'norte', nombre: 'Norte', par_total: 36, course_rating: 55, slope_rating: 130 },
    ],
    course_tees: [],
  }

  it('juzga los recorridos HIJOS, no la cancha padre sana', async () => {
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(HIJOS), PADRE, 18, ['Este', 'Norte'])
    expect(r!.apta).toBe(false)
  })

  it('un solo recorrido roto se bloquea con el mensaje de 9 hoyos', async () => {
    const unHijo = { courses: [HIJOS.courses[0]], course_tees: [] }
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(unHijo), PADRE, 9, ['Este'])
    expect(r!.apta).toBe(false)
    expect(r!.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('un recorrido con el rating de 18h NO se bloquea: el motor lo parte', async () => {
    // Los 9 loops reales de Brisas / Marbella / Rocas (par 36, CR 72). Bloquear
    // estos tres clubes sería un falso positivo: el motor produce el handicap
    // correcto con ellos desde el #293.
    const conRating18h = {
      courses: [{ id: 'este', nombre: 'Este', par_total: 36, course_rating: 72, slope_rating: 130 }],
      course_tees: [],
    }
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(conRating18h), PADRE, 9, ['Este'])
    expect(r!.apta).toBe(true)
  })

  it('sin recorridos juzga la cancha simple', async () => {
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(CATALOGO), PADRE, 18, null)
    expect(r!.apta).toBe(true)
  })

  it('si faltan loops en la BD cae al camino de cancha simple, igual que el motor', async () => {
    // El motor sólo combina cuando encuentra TODOS los loops pedidos.
    const r = await evaluarCanchaDeRondaLibre(
      fakeSupabase({ courses: [HIJOS.courses[0]], course_tees: [] }),
      PADRE,
      18,
      ['Este', 'Norte', 'Sur'],
    )
    // Con un solo hijo devuelto, `fetchRecorridos` da [] y se juzga el padre…
    // que en este fake es ese mismo hijo. Lo importante: no explota y da veredicto.
    expect(r).not.toBeUndefined()
  })

  it('trae los tees de los HIJOS: un loop sin rating propio pero con tee roto se bloquea', async () => {
    // Sin los tees de los hijos este gate quedaba ciego justo en la rama a la
    // que cae el motor cuando un loop no tiene `course_rating`.
    const sinRatingConTeeRoto = {
      courses: [{ id: 'este', nombre: 'Este', par_total: 36, course_rating: null }],
      course_tees: [{ course_id: 'este', rating: 55, front_course_rating: null }],
    }
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(sinRatingConTeeRoto), PADRE, 9, ['Este'])
    expect(r!.apta).toBe(false)
    expect(r!.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('un loop sin rating y con los tees sanos no se bloquea', async () => {
    const sano = {
      courses: [{ id: 'este', nombre: 'Este', par_total: 36, course_rating: null }],
      course_tees: [{ course_id: 'este', rating: 71.2, front_course_rating: 35.8 }],
    }
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase(sano), PADRE, 9, ['Este'])
    expect(r!.apta).toBe(true)
  })

  it('una cancha que no está en la BD no tiene rating que desmentir', async () => {
    const r = await evaluarCanchaDeRondaLibre(fakeSupabase({ courses: [], course_tees: [] }), PADRE, 18, null)
    expect(r).toBeNull()
  })
})

describe('fetchParPorHoyoDisponible — de dónde sale el par de cada hoyo', () => {
  // Brisas tal como está en producción: el club padre NO tiene `course_holes`
  // propios (correcto por diseño) y los tres nueves hijos sí. Cada hijo guarda
  // su `loop_nombre` en la columna `recorrido` de sus hoyos.
  const BRISAS = 'brisas-padre'
  const hoyosDe = (recorrido: string, courseId: string) =>
    Array.from({ length: 9 }, (_, i) => ({
      numero: i + 1, par: 4, stroke_index: i + 1, recorrido, course_id: courseId,
    }))

  const CATALOGO_27H = {
    courses: [
      { id: BRISAS, nombre: 'Club de Golf Brisas de Santo Domingo', par_total: 72, course_rating: 72.6, slope_rating: 130, parent_id: null, loop_nombre: null },
      { id: 'este', nombre: 'Este', par_total: 36, course_rating: 72, slope_rating: 130, parent_id: BRISAS, loop_nombre: 'Este' },
      { id: 'norte', nombre: 'Norte', par_total: 36, course_rating: 72, slope_rating: 130, parent_id: BRISAS, loop_nombre: 'Norte' },
      { id: 'sur', nombre: 'Sur', par_total: 36, course_rating: 72, slope_rating: 130, parent_id: BRISAS, loop_nombre: 'Sur' },
    ],
    course_holes: [
      ...hoyosDe('Este', 'este'), ...hoyosDe('Norte', 'norte'), ...hoyosDe('Sur', 'sur'),
    ],
    course_tees: [],
  }

  it('el club padre sin loops elegidos: la resolución real devuelve 0 hoyos', async () => {
    const d = await fetchParPorHoyoDisponible(fakeSupabase(CATALOGO_27H), BRISAS, null, true)
    expect(d.hoyosResueltos).toBe(0)
    expect(d.recorridosDisponibles).toBe(3)
    expect(evaluarParPorHoyo(d).apta).toBe(false)
  })

  it('con los dos recorridos elegidos, la resolución encuentra los 18 hoyos', async () => {
    // Antes del 09-ago-2026 esto daba 0: la query miraba `course_id = padre`.
    const d = await fetchParPorHoyoDisponible(fakeSupabase(CATALOGO_27H), BRISAS, ['Este', 'Norte'], true)
    expect(d.hoyosResueltos).toBe(18)
    expect(d.loopsElegidos).toBe(2)
    expect(evaluarParPorHoyo(d).apta).toBe(true)
  })

  it('un recorrido elegido que no existe en la BD no aporta hoyos', async () => {
    const d = await fetchParPorHoyoDisponible(fakeSupabase(CATALOGO_27H), BRISAS, ['Este', 'Oeste'], true)
    expect(d.hoyosResueltos).toBe(9)
    expect(evaluarParPorHoyo(d).apta).toBe(true) // 9 hoyos es par por hoyo real
  })

  it('recorridos repetidos no cuentan doble', async () => {
    // El schema acepta `['Este','Este']`; contarlo como 2 loops daría un
    // veredicto distinto que la resolución real, que agrupa por loop.
    const d = await fetchParPorHoyoDisponible(fakeSupabase(CATALOGO_27H), BRISAS, ['Este', 'Este'], true)
    expect(d.loopsElegidos).toBe(1)
    expect(d.hoyosResueltos).toBe(9)
  })

  it('una cancha normal con sus hoyos propios resuelve directo', async () => {
    const catalogo = {
      courses: [{ id: 'los-leones', par_total: 72, course_rating: 71.6, parent_id: null }],
      course_holes: hoyosDe('default', 'los-leones'),
      course_tees: [],
    }
    const d = await fetchParPorHoyoDisponible(fakeSupabase(catalogo), 'los-leones', null, true)
    expect(d.hoyosResueltos).toBe(9)
    expect(evaluarParPorHoyo(d).apta).toBe(true)
  })

  it('Iquique: sin hoyos propios y sin recorridos que elegir', async () => {
    const catalogo = {
      courses: [{ id: 'iquique', par_total: 72, course_rating: null, parent_id: null }],
      course_holes: [],
      course_tees: [],
    }
    const d = await fetchParPorHoyoDisponible(fakeSupabase(catalogo), 'iquique', null, true)
    expect(d).toEqual({
      hoyosResueltos: 0,
      loopsElegidos: 0,
      recorridosDisponibles: 0,
      puedeElegirRecorridos: true,
      existe: true,
    })
  })

  it('una cancha que no está en la BD no bloquea: de eso se ocupa la FK', async () => {
    // Sin esto, un `course_id` inexistente salía bloqueado con "no tiene el par
    // hoyo por hoyo cargado" — un mensaje que miente sobre lo que pasó, y
    // asimétrico con `evaluarCanchaDeRondaLibre`, que devuelve null.
    const d = await fetchParPorHoyoDisponible(
      fakeSupabase({ courses: [], course_holes: [], course_tees: [] }),
      'cancha-que-no-existe',
      null,
      true,
    )
    expect(d.existe).toBe(false)
    expect(evaluarParPorHoyo(d).apta).toBe(true)
  })

  it('falla CERRADO si la BD se cae al pedir los recorridos', async () => {
    await expect(
      fetchParPorHoyoDisponible(fakeSupabase(CATALOGO_27H, [], 'courses'), BRISAS, null, true),
    ).rejects.toThrow(/recorridos/)
  })
})

describe('evaluarRondaLibre — las dos preguntas, cada una en su momento', () => {
  const BRISAS = 'brisas-padre'
  const SIN_PAR_POR_HOYO = {
    courses: [
      { id: BRISAS, par_total: 72, course_rating: 72.6, slope_rating: 130, parent_id: null, loop_nombre: null },
      { id: 'este', par_total: 36, course_rating: 72, slope_rating: 130, parent_id: BRISAS, loop_nombre: 'Este' },
    ],
    course_holes: Array.from({ length: 9 }, (_, i) => ({
      numero: i + 1, par: 4, stroke_index: i + 1, recorrido: 'Este', course_id: 'este',
    })),
    course_tees: [],
  }

  it('una ronda GROSS en el club padre sin recorridos se frena igual', async () => {
    // Éste es el bug: las 4 rondas rotas de producción son gross, y el gate de
    // rating no corre en gross. El par por hoyo no depende del modo.
    const v = await evaluarRondaLibre(fakeSupabase(SIN_PAR_POR_HOYO), BRISAS, 18, null, {
      requiereRating: false,
    })
    expect(v.apta).toBe(false)
    expect(v.motivo).toBe('sin_par_por_hoyo')
    expect(bloqueaRondaLibre(v)).toBe(true)
  })

  it('con el recorrido elegido, la misma ronda gross pasa', async () => {
    const v = await evaluarRondaLibre(fakeSupabase(SIN_PAR_POR_HOYO), BRISAS, 9, ['Este'], {
      requiereRating: false,
    })
    expect(v.apta).toBe(true)
  })

  it('en gross no se juzga el rating: una cancha sin rating sano no frena', async () => {
    const ratingRoto = {
      courses: [{ id: 'rio-blanco', par_total: 35, course_rating: null, slope_rating: 130, parent_id: null }],
      course_holes: Array.from({ length: 9 }, (_, i) => ({
        numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null, course_id: 'rio-blanco',
      })),
      course_tees: [{ course_id: 'rio-blanco', rating: 55, front_course_rating: null }],
    }
    const v = await evaluarRondaLibre(fakeSupabase(ratingRoto), 'rio-blanco', 9, null, {
      requiereRating: false,
    })
    expect(v.apta).toBe(true)
  })

  it('en neto la misma cancha sí se frena por el rating', async () => {
    const ratingRoto = {
      courses: [{ id: 'rio-blanco', par_total: 35, course_rating: null, slope_rating: 130, parent_id: null }],
      course_holes: Array.from({ length: 9 }, (_, i) => ({
        numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null, course_id: 'rio-blanco',
      })),
      course_tees: [{ course_id: 'rio-blanco', rating: 55, front_course_rating: null }],
    }
    const v = await evaluarRondaLibre(fakeSupabase(ratingRoto), 'rio-blanco', 9, null, {
      requiereRating: true,
    })
    expect(v.apta).toBe(false)
    expect(v.motivo).toBe('rating_incoherente')
  })
})

describe('canchasNoAptasParaTorneo — el par por hoyo también es requisito', () => {
  // Un torneo NO elige recorridos: `tournaments` no tiene esa columna. Así que
  // el par tiene que salir de `course_holes` de la cancha elegida. Para los
  // complejos de 27 hoyos el catálogo ya ofrece la combinación armada
  // ("Norte - Sur", 18 hoyos cargados) — es ésa la que hay que elegir, no el
  // club padre.
  const BRISAS_PADRE = 'brisas-padre'
  const BRISAS_NORTE_SUR = 'brisas-norte-sur'
  const CATALOGO = {
    courses: [
      { id: BRISAS_PADRE, nombre: 'Club de Golf Brisas de Santo Domingo', par_total: 72, course_rating: 72.6, slope_rating: 130, parent_id: null },
      { id: BRISAS_NORTE_SUR, nombre: 'C.G. Las Brisas De Santo Domingo - Norte - Sur (VARONES)', par_total: 72, course_rating: 72.6, slope_rating: 130, parent_id: null },
    ],
    course_holes: Array.from({ length: 18 }, (_, i) => ({
      numero: i + 1, par: 4, stroke_index: i + 1, recorrido: null, course_id: BRISAS_NORTE_SUR,
    })),
    course_tees: [],
  }

  it('bloquea un torneo NETO sobre el club padre sin par por hoyo', async () => {
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase(CATALOGO),
      [{ round_number: 1, course_id: BRISAS_PADRE, hole_count: 18 }],
      NETO,
    )
    expect(r).toHaveLength(1)
    expect(r[0].motivo).toBe('sin_par_por_hoyo')
  })

  it('bloquea también un torneo GROSS: el par por hoyo no depende del modo', async () => {
    // El gate de rating hace early-return en gross. El de par por hoyo no puede.
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase(CATALOGO),
      [{ round_number: 1, course_id: BRISAS_PADRE, hole_count: 18 }],
      { modo: 'gross', use_handicap: false },
    )
    expect(r).toHaveLength(1)
    expect(r[0].motivo).toBe('sin_par_por_hoyo')
  })

  it('la combinación ya armada del catálogo sí pasa', async () => {
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase(CATALOGO),
      [{ round_number: 1, course_id: BRISAS_NORTE_SUR, hole_count: 18 }],
      NETO,
    )
    expect(r).toEqual([])
  })

  it('un torneo gross sobre una cancha sana no se bloquea por nada', async () => {
    const r = await canchasNoAptasParaTorneo(
      fakeSupabase(CATALOGO),
      [{ round_number: 1, course_id: BRISAS_NORTE_SUR, hole_count: 18 }],
      { modo: 'gross', use_handicap: false },
    )
    expect(r).toEqual([])
  })
})
