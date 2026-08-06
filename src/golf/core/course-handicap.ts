/**
 * Convierte un Handicap Index (decimal, universal) a Course Handicap (entero, por cancha).
 *
 * Fórmula WHS:
 *   18h: CH = round(index × (slope / 113) + (CR - par))
 *    9h: CH = round((index / 2) × (slope_9h / 113) + (CR_9h - par_9h))
 *
 * Si no hay datos de cancha, fallback = round(index).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ratingEsCreible } from '@/golf/courses/rating-coherente'
import {
  PAR_FALLBACK,
  esEscalaDe18Hoyos,
  courseRatingEnEscalaDe9,
  parEnEscalaDe9,
  hoyosDeUnaVuelta,
  hoyosDeLaVuelta,
  parDeVariasVueltas,
  ratingDeVueltas,
  resolverRatingEnEscalaDe9,
  sumaDeVueltas,
  vueltasDeLaRonda,
  type RatingDeLaRonda,
} from '@/golf/courses/vueltas'

// Las tres preguntas de escala (`¿este par es de 18?`, `¿cómo se ve este par /
// este rating en una vuelta de 9?`) se mudaron a `@/golf/courses/vueltas`, que
// también contesta cuántas vueltas se dan y qué hoyos se juegan. Se re-exportan
// para no romper los ~20 imports existentes: la DEFINICIÓN vive en un solo lado.
export {
  esEscalaDe18Hoyos,
  parEnEscalaDe9,
  courseRatingEnEscalaDe9,
} from '@/golf/courses/vueltas'

export interface CourseData {
  slope: number
  courseRating: number
  par: number
  is9Hole?: boolean
}

/**
 * FUENTE ÚNICA del camino seguro: qué handicap se reparte cuando la cancha no
 * aporta un rating utilizable (no hay dato, o el que hay es incoherente).
 *
 * WHS: sin CR/slope el course handicap es el índice del jugador. En una vuelta
 * de 9 hoyos es la MITAD, porque `strokesRecibidosEnHoyo` reparte el número
 * sobre 9 hoyos (maxSI=9) — devolver el índice entero le daría el doble de
 * golpes, el mismo bug que arregló el PR #289 por el otro lado.
 *
 * Nunca produce un negativo ni un +36 para un índice normal: es el índice, y
 * nada más que el índice.
 */
export function handicapSinDatosDeCancha(handicapIndex: number, is9Hole: boolean): number {
  return Math.round(is9Hole ? indiceDe9Hoyos(handicapIndex) : handicapIndex)
}

/**
 * Calcula Course Handicap a partir de Handicap Index y datos de cancha.
 * Siempre devuelve un entero (no existen "0.5 golpes").
 *
 * GUARDARRAIL: si el rating de la cancha es incoherente con su par (ver
 * `@/golf/courses/rating-coherente`), NO se inventa un número — se cae al
 * camino seguro. Sin esto, C.G. Río Blanco (par 35, rating 55 cargado en
 * escala de 18) le daba +26 golpes a un jugador de índice 12.
 *
 * @param roundHoles Hoyos que se juegan. Sólo hace falta para el camino
 *   seguro: cuando `courseData` es null, ese objeto no puede decir si la
 *   vuelta es de 9, y sin el dato se reparte el índice ENTERO sobre 9 hoyos —
 *   el doble de golpes. Pasarlo siempre que se conozca. Cuando `courseData`
 *   trae `is9Hole`, ese campo manda (es el que usó la fórmula).
 */
export function resolverCourseHandicap(
  handicapIndex: number,
  courseData: CourseData | null,
  roundHoles?: number
): number {
  const is9Hole = courseData?.is9Hole ?? (roundHoles != null && roundHoles <= 9)
  if (!courseData || !courseData.slope || !courseData.courseRating) {
    return handicapSinDatosDeCancha(handicapIndex, is9Hole)
  }
  const { slope, courseRating, par } = courseData
  if (!ratingEsCreible({ courseRating, par, holes: is9Hole ? 9 : 18 })) {
    return handicapSinDatosDeCancha(handicapIndex, is9Hole)
  }
  // 9 hoyos: el Course Handicap WHS usa el ÍNDICE DE 9 HOYOS = índice 18h / 2,
  // combinado con el slope/CR/par de 9h. `strokesRecibidosEnHoyo` reparte este CH
  // sobre los 9 hoyos jugados (maxSI=9), así que el CH debe ser el de 9h, no el de
  // 18h. Sin esta división, una ronda de 9h recibía ~2× los golpes correctos.
  // `is9Hole` (no `courseData.is9Hole`): tiene que ser LA MISMA lectura que usó
  // la validación de arriba. Con dos lecturas distintas, una vuelta de 9 podía
  // validarse como de 9 y calcularse como de 18 — el doble de golpes.
  const idx = is9Hole ? indiceDe9Hoyos(handicapIndex) : handicapIndex
  return Math.round(idx * (slope / 113) + (courseRating - par))
}

/**
 * Course Handicap COMPLETO (18h) para MOSTRAR al usuario en la columna HCP.
 *
 * Una ronda de 9 hoyos SE PUNTÚA con el course handicap de 9h (mitad del índice,
 * ratings del front-9) — eso es WHS-correcto y NO se toca. Pero el número que se
 * MUESTRA como "el handicap del jugador" siempre debe ser el completo: si una ronda
 * de 9h muestra la mitad (ej. 8 en vez de 15), pierde significado para quien la mira.
 *
 * Fuente única del concepto "handicap a mostrar":
 *  - ronda de 18h → idéntico al de scoring (`courseData9h` no es 9Hole).
 *  - ronda de 9h  → el course handicap de 18h (`courseData18h`), NO la mitad.
 *
 * @param handicapIndex Índice del jugador.
 * @param courseData9h  CourseData con el que se PUNTÚA (is9Hole=true en rondas de 9h).
 * @param courseData18h CourseData de 18h para el valor de display (mismo tee). Sólo
 *   se usa cuando la ronda es de 9h; si es null, cae a `Math.round(index)`.
 */
export function resolverCourseHandicapDisplay(
  handicapIndex: number,
  courseData9h: CourseData | null,
  courseData18h: CourseData | null
): number {
  if (!courseData9h?.is9Hole) return resolverCourseHandicap(handicapIndex, courseData9h)
  // A propósito SIN `roundHoles`: el número que se muestra es el de 18 hoyos
  // aunque la vuelta sea de 9, así que su camino seguro es el índice entero.
  return resolverCourseHandicap(handicapIndex, courseData18h)
}

/**
 * Course handicap PARA MOSTRAR de un jugador de ronda libre. FUENTE ÚNICA.
 *
 * Envuelve `resolverCourseHandicapDisplay` con la parte incómoda: cuando la
 * vuelta es de 9 hoyos hay que ir a buscar el CourseData de 18h del MISMO tee,
 * porque el número que se muestra siempre es el completo.
 *
 * `finalParTotal` es el par de 18h SÓLO si la ronda no tiene recorridos (ahí la
 * query de `course_holes` trae los 18). En una cancha multi-recorrido jugada
 * como un loop de 9, ese par es el del loop (~36) y no se puede derivar el de
 * 18 de forma confiable: se devuelve `round(index)`, nunca un valor inflado.
 *
 * Existe porque este bloque estaba copiado en `lib/data/ronda-libre.ts` y en
 * `useRondaScoreData.ts`, y `score-grupo` — la única pantalla que nunca lo
 * adoptó — mostraba la MITAD del handicap.
 *
 * @param cache18h Cache compartido entre los jugadores, para no repetir la
 *   consulta. La clave lleva la CANCHA además del tee: un torneo puede tener
 *   rondas en canchas distintas, y cachear sólo por tee devolvería el
 *   CourseData de la cancha equivocada.
 * @param cargar Inyectable porque hay dos clientes de Supabase: las pantallas
 *   de ronda libre corren en el browser y el board de torneo corre en el
 *   servidor con el cliente del request.
 */
export async function resolverHandicapDisplayDeRonda(
  handicapIndex: number,
  courseData9h: CourseData | null,
  ronda: {
    courseId: string | null
    tee: string
    finalParTotal?: number
    tieneRecorridos: boolean
  },
  cache18h: Map<string, CourseData | null>,
  cargar: CargadorDeCourseData = cargarCourseData,
): Promise<number> {
  let courseData18h = courseData9h
  if (courseData9h?.is9Hole) {
    if (ronda.tieneRecorridos) {
      courseData18h = null
    } else {
      const clave = `${ronda.courseId}|${ronda.tee}|18`
      if (!cache18h.has(clave)) {
        cache18h.set(
          clave,
          await cargar(ronda.courseId, ronda.tee, 18, ronda.finalParTotal),
        )
      }
      courseData18h = cache18h.get(clave) ?? null
    }
  }
  return resolverCourseHandicapDisplay(handicapIndex, courseData9h, courseData18h)
}

/** Cómo se trae un CourseData. Ver `resolverHandicapDisplayDeRonda`. */
export type CargadorDeCourseData = (
  courseId: string | null,
  tee: string,
  holes: number,
  parTotal?: number,
) => Promise<CourseData | null>

/**
 * Course handicap a APLICAR según los hoyos jugados (fuente única del ajuste 9h
 * para handicaps que YA están en escala de course handicap de 18h).
 *
 * WHS: el course handicap de 9 hoyos = round(course handicap de 18h / 2). Lo usan
 * los formatos por equipo scramble/foursome, cuyo team handicap (allowance USGA
 * sobre los índices) está en escala de 18h y NO pasa por `resolverCourseHandicap`.
 * Sin esto, una ronda de 9h repartía ~2× los golpes correctos. Para 18 hoyos
 * devuelve el valor sin tocar. Distribuir con `strokesRecibidosEnHoyo(.., roundHoles)`.
 *
 * NO usar sobre handicaps que YA fueron resueltos a 9h por `resolverCourseHandicap`
 * (ej. el dot handicap por jugador de best ball / score-grupo): los dividiría dos veces.
 */
export function courseHandicapParaHoyos(courseHandicap18h: number, roundHoles: number): number {
  return roundHoles <= 9 ? Math.round(courseHandicap18h / 2) : courseHandicap18h
}

/**
 * Par de los 9 hoyos jugados (front-9), para NO mezclar el CR de 9h con el par de 18h.
 *
 * Causa raíz del bug "neto peor que gross" (11-jun-2026): en una ronda de 9 hoyos
 * sobre una cancha de 18, los callers pasan `parTotal` = suma de los 18 hoyos (72).
 * Combinado con el front-9 Course Rating (~36) daba (CR − par) ≈ −36 → course
 * handicaps NEGATIVOS (−22) → neto peor que gross. Acá se deriva el par REAL del
 * front-9 desde course_holes (autoridad), no la mitad a ojo.
 */
async function resolveNineHolePar(
  supabase: SupabaseClient,
  courseId: string,
  parTotal: number | undefined,
): Promise<number> {
  // Si el caller ya pasó un par de 9 hoyos, es correcto: respetarlo.
  if (parTotal != null && !esEscalaDe18Hoyos(parTotal)) return parTotal
  // El caller pasó el par de 18 (o nada): derivar el par del front-9 real.
  const { data } = await supabase
    .from('course_holes')
    .select('numero, par')
    .eq('course_id', courseId)
    .order('numero')
  if (data && data.length > 0) {
    const par9 = parDeLosHoyosJugados(data as Array<{ numero: number; par: number | null }>, 9)
    if (par9 > 0) return par9
  }
  // Sin datos de hoyos: mitad del par-18 si lo tenemos (aprox. simétrica), si no 36.
  return parTotal != null ? parEnEscalaDe9(parTotal) : 36
}

/**
 * FUENTE ÚNICA del par que va en la fórmula WHS: el par de los hoyos que
 * EFECTIVAMENTE se juegan, deduplicado por nº de hoyo.
 *
 * Mezclar el Course Rating de 9 hoyos (~36) con el par de 18 (72) da
 * `(CR − par) ≈ −36` y produce course handicaps NEGATIVOS — neto peor que
 * gross. Ese bug se arregló en el camino de ronda libre el 11-jun-2026 y
 * reapareció idéntico en el camino de torneos, porque cada uno resolvía el par
 * por su cuenta.
 *
 * Dedup por `numero`: las canchas 27/36h traen filas repetidas por recorrido y
 * un `slice(0, 9)` crudo agarraría 1,1,2,2,… sumando menos de 9 hoyos.
 *
 * Delega en `hoyosDeLaVuelta` (fuente única): con un catálogo de 9 hoyos y una
 * ronda de 18 la cancha se recorre DOS VECES, así que el par correcto es 2×35 =
 * 70 — no 36 + 9×4 = 72, que es lo que devolvía el relleno a par 4 y lo que
 * hacía que un Course Rating de 9 hoyos sano pareciera incoherente.
 *
 * El corte a `roundHoles` es de acá y no de `hoyosDeLaVuelta`: esa devuelve la
 * cancha entera a propósito (una ronda de 9 puede jugar los hoyos 10-18).
 */
export function parDeLosHoyosJugados(
  holes: Array<{ numero: number; par: number | null }>,
  roundHoles: number,
): number {
  const hoyos = hoyosDeLaVuelta(holes, roundHoles).slice(0, roundHoles)
  const faltantes = Math.max(0, roundHoles - hoyos.length)
  return hoyos.reduce((sum, h) => sum + h.par, 0) + faltantes * PAR_FALLBACK
}

/**
 * FUENTE ÚNICA del par de una ronda de torneo, con o sin catálogo de hoyos.
 *
 * `parDeLosHoyosJugados` es la respuesta buena cuando `course_holes` tiene
 * filas. Sin catálogo devuelve la cancha neutra (18 × par 4 = 72), que descarta
 * el par REAL que la cancha sí publica en `courses.par_total` — y hoy los tres
 * clubes de 27 tienen justamente 0 filas en `course_holes`.
 *
 * Existe porque el par del torneo estaba contestado de dos formas:
 * `/torneo/[slug]` y el Resumen del organizador usaban `courses.par_total ?? 72`
 * y `/en-vivo` y `/tv` usaban la suma del catálogo. Con una cancha de 18 par 71
 * sin hoyos cargados ya discrepaban (71 contra 72); con una cancha de 9 en un
 * torneo de 18 la diferencia salta a 35 golpes, porque `courses.par_total` es
 * el par de UNA vuelta y la ronda da dos. Ese número es el que usa el board para
 * las tarjetas cargadas sólo por totales: el vs-par del jugador quedaba corrido
 * una vuelta entera, y las cuatro pantallas del mismo torneo mostraban cosas
 * distintas según por dónde entrara el que mira.
 */
export function parDeLaRondaDelTorneo(
  catalogo: Array<{ numero: number; par: number | null }>,
  roundHoles: number,
  parDeLaCancha: number | null | undefined,
): number {
  if (catalogo.length > 0) return parDeLosHoyosJugados(catalogo, roundHoles)
  return parDeVariasVueltas(
    parDeLaCancha,
    vueltasDeLaRonda(hoyosDeUnaVuelta(parDeLaCancha), roundHoles),
  )
}

/** Lo que un tee publica sobre su rating. Forma común a los dos motores. */
export interface TeeRatings {
  rating: number
  slope: number
  front_course_rating?: number | null
  front_slope_rating?: number | null
}

/**
 * CR y slope de 9 hoyos de un tee. FUENTE ÚNICA.
 *
 * Cada campo se decide por separado a propósito: un club puede publicar el CR
 * de 9 hoyos MEDIDO sin publicar el slope de 9. Exigir los dos juntos tiraba
 * ese CR medido a la basura y volvía a la aproximación CR/2 — peor dato
 * teniendo el bueno en la mano. Para el slope la aproximación slope9≈slope18
 * es la que recomienda WHS; para el CR no hay tal cosa.
 *
 * `parDeLaCancha` es la señal de escala del `rating` de 18h, y tiene que ser el
 * par PROPIO de la cancha (`courses.par_total`), nunca el par de la ronda: ese
 * último puede venir ya dividido y no distingue media cancha de 72 de una
 * cancha de 9 hoyos reales.
 */
export function ratingsDe9DelTee(
  tee: TeeRatings,
  parDeLaCancha: number,
): { slope: number; courseRating: number } {
  if (tee.front_course_rating != null) {
    return { slope: tee.front_slope_rating ?? tee.slope, courseRating: tee.front_course_rating }
  }
  // Un `rating` IMPOSIBLE deja a este eslabón SIN dato utilizable, y hay que
  // decirlo: `resolverRatingEnEscalaDe9` devuelve el par cuando se rinde, y ese
  // valor pasa el guardarrail con delta 0 — el tee roto ganaba y la cadena de
  // fallback hacia el rating de la cancha quedaba muerta. `NaN` es lo que ya
  // significa "no hay rating" para `ratingEsCreible` (`Number.isFinite`), así
  // que el eslabón de abajo corre igual que si el tee no publicara nada.
  const { courseRating, escala } = resolverRatingEnEscalaDe9(tee.rating, parDeLaCancha)
  return {
    slope: tee.front_slope_rating ?? tee.slope,
    courseRating: escala === 'imposible' ? NaN : courseRating,
  }
}

/**
 * Índice de 9 hoyos = índice 18h / 2 (WHS).
 *
 * Fuente única de la mitad: `strokesRecibidosEnHoyo` reparte el course handicap
 * sobre los 9 hoyos jugados (maxSI=9), así que el CH tiene que ser el de 9h.
 * Sin la división la ronda de 9h recibe ~2× los golpes que corresponden.
 */
export function indiceDe9Hoyos(handicapIndex: number): number {
  return handicapIndex / 2
}

/**
 * Carga CourseData desde Supabase para una cancha/tee/holes dado.
 * Usa el cliente browser de Supabase (solo para componentes client-side).
 *
 * @param courseId - ID de la cancha (null = sin cancha vinculada)
 * @param tees - nombre del tee (ej: "azul", "blanco")
 * @param holes - cantidad de hoyos (9 o 18)
 * @param parTotal - par total real calculado desde course_holes (más preciso que BD)
 * @param recorridos - lista de loop_nombre a combinar (canchas 27h/36h). Si length>=1
 *                    y la cancha tiene children matching, combina sus ratings.
 *
 * Usa el cliente browser de Supabase (solo client-side). Para contextos
 * server-side (leaderboard) usar `resolverCourseData` con el cliente del request.
 */
export async function cargarCourseData(
  courseId: string | null,
  tees: string,
  holes: number,
  parTotal?: number,
  recorridos?: string[] | null
): Promise<CourseData | null> {
  if (!courseId) return null
  // Dynamic import para evitar que el módulo se evalúe en contextos no-browser
  const { createClient } = await import('@/lib/supabase')
  return resolverCourseData(createClient(), courseId, tees, holes, parTotal, recorridos)
}

/**
 * Núcleo de `cargarCourseData` parametrizado por cliente Supabase, para reusar la
 * MISMA lógica de lookup (tee-specific → courses → multi-recorrido) tanto en el
 * scorer client-side como en el leaderboard server-side. Garantiza que el course
 * handicap del leaderboard coincida exactamente con el de la tarjeta en cancha.
 */
export async function resolverCourseData(
  supabase: SupabaseClient,
  courseId: string | null,
  tees: string,
  holes: number,
  parTotal?: number,
  recorridos?: string[] | null
): Promise<CourseData | null> {
  if (!courseId) return null

  // 0. Multi-recorrido: si hay loops seleccionados, combinar ratings de los
  //    child courses correspondientes (ej: Brisas 27h = parent + 3 children).
  //    Cada child (9h) aporta su CR (aditivo) y slope (promediado).
  if (recorridos && recorridos.length >= 1) {
    const { data: children } = await supabase
      .from('courses')
      .select('id, loop_nombre, course_rating, slope_rating, par_total')
      .eq('parent_id', courseId)
      .in('loop_nombre', recorridos)

    if (children && children.length === recorridos.length) {
      // Sumar CR/par across loops; promediar slope ponderado por hoyos.
      // Asumimos que cada child es 9h (o 18h si tipo_recorrido lo define).
      // Cada loop aporta su rating YA NORMALIZADO a la escala de su propio par.
      // Sumarlos crudos era el agujero grande: los 9 loops hijos del catálogo
      // guardan `par_total = 36` con `course_rating = 72`, así que un recorrido
      // de 1 loop sumaba 72 contra un par de 36 (+36 golpes) y uno de 2 loops
      // sumaba 144 contra 72 (+72). Este paso 0 era el ÚNICO consumidor de la
      // escala que no pasaba por el helper canónico.
      const crSum = children.reduce(
        (s, c) => s + (c.course_rating != null ? courseRatingEnEscalaDe9(c.course_rating, c.par_total ?? 36) : 0),
        0,
      )
      const parSum = children.reduce((s, c) => s + (c.par_total ?? 36), 0)

      // `parSum` es el par AUTORITATIVO de los loops elegidos: sale de las
      // filas hijas, así que ya está en la escala del recorrido. `parTotal`
      // (derivado de course_holes) es más fino, pero sólo sirve si viene en
      // la MISMA escala — y no siempre viene. Este paso era el único de los
      // tres que lo tomaba a ciegas; mientras el CR tampoco se normalizaba,
      // un par de 72 se cancelaba solo contra un CR de 72 y salía bien por
      // accidente. Comparar las dos escalas cierra las DOS direcciones: un
      // parTotal de 18 en un recorrido de 9 (daba −30) y uno de 9 en un
      // recorrido de 18 (daba +108).
      const parDeLosLoops =
        parTotal != null && esEscalaDe18Hoyos(parTotal) === esEscalaDe18Hoyos(parSum)
          ? parTotal
          : parSum
      const slopeAvg = children.length > 0
        ? Math.round(children.reduce((s, c) => s + (c.slope_rating ?? 113), 0) / children.length)
        : 113
      // Un solo loop elegido pero ronda de 18 = ese loop de 9 jugado DOS VECES.
      // Sin esto la ronda se calculaba con el CR y el par de UNA vuelta contra
      // 18 hoyos de score: `(CR − par)` corrido ~36 golpes, y encima `is9Hole`
      // en true le partía el índice al jugador en una vuelta de 18.
      //
      // Los hoyos que cubre la selección salen del par de cada hijo, no de un
      // `× 9` fijo: el comentario de arriba admite que un hijo puede ser de 18,
      // y ahí un `× 9` haría que una ronda de 18 pareciera dos vueltas y
      // duplicaría el rating.
      const hoyosDeLosLoops = children.reduce(
        (s, c) => s + hoyosDeUnaVuelta(c.par_total ?? 36), 0,
      )
      const vueltasDeLoop = vueltasDeLaRonda(hoyosDeLosLoops, holes)
      /**
       * Devuelve el CourseData de esta rama, o null si el rating combinado no es
       * creíble contra el par de la ronda. La validación sólo corre cuando hay
       * más de una vuelta — ahí el error de escala se MULTIPLICA, y devolver un
       * rating al doble sería +72 golpes.
       */
      const combinado = (cr: number, slope: number): CourseData | null => {
        const deLaRonda = ratingDeVueltas(cr, parSum, vueltasDeLoop)
        // Con UNA vuelta manda `parDeLosLoops`: el `parTotal` del caller sólo se
        // acepta si viene en la misma escala que las filas hijas. Tomarlo a
        // ciegas era el agujero que cerró el #293 en las dos direcciones (un
        // parTotal de 18 en un recorrido de 9 daba −30; uno de 9 en uno de 18,
        // +108). Con VARIAS vueltas el par ya salió de escalar el par de los
        // loops, y el `parTotal` del caller no puede corregirlo: viene de
        // `course_holes`, que para estas canchas está vacío.
        const par = vueltasDeLoop > 1 ? deLaRonda.par : parDeLosLoops
        if (vueltasDeLoop > 1 && !ratingEsCreible({ courseRating: deLaRonda.courseRating, par, holes })) {
          return null
        }
        return {
          slope,
          courseRating: deLaRonda.courseRating,
          par,
          is9Hole: recorridos.length === 1 && holes <= 9,
        }
      }
      const allHaveRatings = children.every(c => c.course_rating && c.slope_rating)
      if (allHaveRatings) {
        const cd = combinado(crSum, slopeAvg)
        if (cd) return cd
      }
      // Fallback a tee-specific lookup sobre children individualmente.
      const teeNorm2 = tees.toLowerCase()
      const childIds = children.map(c => c.id)
      const { data: teeRows } = await supabase
        .from('course_tees')
        .select('course_id, rating, slope, front_course_rating, front_slope_rating')
        .in('course_id', childIds)
        .ilike('nombre', `${teeNorm2}%`)
      if (teeRows && teeRows.length === children.length) {
        // Mismo criterio que `crSum`: `front_course_rating` ya es un CR de 9
        // hoyos MEDIDO y se usa tal cual; el `rating` genérico del tee hay que
        // normalizarlo contra el par de SU loop antes de sumarlo.
        const parPorLoop = new Map(children.map((c) => [c.id, c.par_total ?? 36]))
        const crSumTee = teeRows.reduce((s, t) => {
          if (t.front_course_rating != null) return s + t.front_course_rating
          if (t.rating == null) return s
          return s + courseRatingEnEscalaDe9(t.rating, parPorLoop.get(t.course_id) ?? 36)
        }, 0)
        const slopeAvgTee = Math.round(
          teeRows.reduce((s, t) => s + (t.front_slope_rating ?? t.slope ?? 113), 0) / teeRows.length
        )
        if (crSumTee > 0 && slopeAvgTee > 0) {
          const cd = combinado(crSumTee, slopeAvgTee)
          if (cd) return cd
        }
      }
      // Si data insuficiente en children → caer al flujo single-course.
    }
  }

  // La fila de `courses` se lee ANTES de decidir nada: su `par_total` es la
  // señal de escala que necesitan los DOS eslabones (¿es una cancha de 9?,
  // ¿esta ronda la recorre dos veces?). Antes se leía dos veces — una para la
  // escala del tee, otra como fallback — y el eslabón de 18 hoyos no la leía
  // nunca, así que no podía enterarse de que la cancha era de 9. Va en paralelo
  // con la del tee para no agregar un viaje de ida y vuelta al board.
  const teeNorm = tees.toLowerCase()
  const [{ data: course }, { data: teeData }] = await Promise.all([
    supabase
      .from('courses')
      .select('slope_rating, course_rating, par_total')
      .eq('id', courseId)
      .maybeSingle(),
    supabase
      .from('course_tees')
      .select('rating, slope, front_course_rating, front_slope_rating')
      .eq('course_id', courseId)
      .ilike('nombre', `${teeNorm}%`)
      .limit(1)
      .maybeSingle(),
  ])

  const parDeLaCancha: number | null = course?.par_total ?? null
  // Una cancha de 9 hoyos jugada a 18 se recorre DOS VECES: su Course Rating y
  // su par son los de UNA vuelta y hay que sumarlos, no compararlos contra 18
  // hoyos de score. El slope no se toca (es adimensional).
  const vueltas = vueltasDeLaRonda(hoyosDeUnaVuelta(parDeLaCancha), holes)

  // 1. Intentar CR/Slope específico del tee (más preciso)
  if (teeData?.rating && teeData?.slope) {
    if (holes <= 9) {
      // Ronda de 9h. Con ratings de front-9 publicados, usarlos tal cual. Sin
      // ellos (288 de 477 tees del catálogo, ~60%), aproximación WHS: slope9≈slope18,
      // CR9=CR18/2, par del front-9 real. En AMBOS caminos is9Hole=true, para que
      // resolverCourseHandicap divida el índice por 2 (Rule 6.1). Sin el flag el
      // jugador recibía ~2× los golpes — mismo criterio que el fallback courses (abajo).
      // La escala del `rating` de 18h sale del par propio de la cancha; sin la
      // fila de courses se asume 18h — comportamiento previo.
      const { slope, courseRating } = ratingsDe9DelTee(teeData as TeeRatings, parDeLaCancha ?? 72)
      const par = await resolveNineHolePar(supabase, courseId, parTotal)
      if (ratingEsCreible({ courseRating, par, holes: 9 })) {
        return { slope, courseRating, par, is9Hole: true }
      }
      // El tee MIENTE: se baja al siguiente eslabón (la tabla `courses`), igual
      // que hace `computePlayerCourseHcp`. Los dos motores tienen que contestar
      // lo mismo a "¿qué hago cuando un rating miente?", o el mismo jugador en
      // la misma cancha recibe dos handicaps distintos según la pantalla.
      // `holes` y no un 18 fijo: `computePlayerCourseHcp` pasa los hoyos reales
      // y la tolerancia escala con ellos. Dos números distintos para el mismo
      // predicado harían que los motores clasifiquen distinto el mismo rating.
    } else if (vueltas > 1) {
      // Cancha de 9 jugada a 18: el rating del tee es el de UNA vuelta (su
      // `front_course_rating` medido, o el `rating` que ya está en escala de 9
      // porque el par de la cancha lo es). Se suman las vueltas.
      const unaVuelta = ratingsDe9DelTee(teeData as TeeRatings, parDeLaCancha ?? 36)
      const par = parDeVariasVueltas(parDeLaCancha, vueltas)
      const courseRating = sumaDeVueltas(unaVuelta.courseRating, vueltas)
      if (ratingEsCreible({ courseRating, par, holes })) {
        return { slope: unaVuelta.slope, courseRating, par }
      }
      // El tee miente: se baja al eslabón de `courses`, igual que en 9 hoyos.
    } else if (ratingEsCreible({ courseRating: teeData.rating, par: parTotal ?? 72, holes })) {
      return {
        slope: teeData.slope,
        courseRating: teeData.rating,
        par: parTotal ?? 72,
      }
    }
  }

  // 2. Fallback: tabla courses
  if (course?.slope_rating && course?.course_rating) {
    if (holes <= 9) {
      // Sin CR/slope de 9h en la tabla courses: aprox. WHS (CR/2), mismo criterio
      // que indice-golfers.ts. El par debe ser de 9 hoyos, NO de 18.
      return {
        slope: course.slope_rating,
        // Acá sí tenemos el par PROPIO de la cancha en la mano: esa es la señal
        // de escala, y tiene prioridad sobre el `parTotal` de la ronda.
        courseRating: courseRatingEnEscalaDe9(course.course_rating, parDeLaCancha ?? parTotal ?? 72),
        par: await resolveNineHolePar(supabase, courseId, parTotal ?? parDeLaCancha ?? undefined),
        is9Hole: true,
      }
    }
    if (vueltas > 1) {
      const courseRating = sumaDeVueltas(
        courseRatingEnEscalaDe9(course.course_rating, parDeLaCancha ?? 36),
        vueltas,
      )
      const par = parDeVariasVueltas(parDeLaCancha, vueltas)
      // Se valida acá, igual que su gemela en `computePlayerCourseHcp`: si este
      // eslabón miente, devolverlo taparía un tee sano de más arriba y los dos
      // motores clasificarían distinto el mismo rating.
      if (ratingEsCreible({ courseRating, par, holes })) {
        return { slope: course.slope_rating, courseRating, par }
      }
      return null
    }
    return {
      slope: course.slope_rating,
      courseRating: course.course_rating,
      par: parTotal ?? parDeLaCancha ?? 72,
    }
  }

  return null
}
