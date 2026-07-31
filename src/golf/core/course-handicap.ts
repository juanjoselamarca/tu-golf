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
 */
export function resolverCourseHandicap(
  handicapIndex: number,
  courseData: CourseData | null
): number {
  const is9Hole = courseData?.is9Hole === true
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
  const idx = courseData.is9Hole ? indiceDe9Hoyos(handicapIndex) : handicapIndex
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
  return resolverCourseHandicap(handicapIndex, courseData18h)
}

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
 */
export function parDeLosHoyosJugados(
  holes: Array<{ numero: number; par: number | null }>,
  roundHoles: number,
): number {
  const parByNumero = new Map<number, number>()
  for (const h of holes) {
    if (!parByNumero.has(h.numero)) parByNumero.set(h.numero, h.par ?? 4)
  }
  const cargados = Array.from(parByNumero.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, roundHoles)
  const suma = cargados.reduce((sum, [, par]) => sum + par, 0)
  // Catálogo incompleto (menos hoyos cargados que los de la ronda): completar a
  // par 4, el mismo fallback que `buildFallbackCourseHoles` y
  // `computeIndividualScore`. Devolver un par CORTO sería el bug espejo del que
  // esta función existe para matar: con un catálogo de 9 hoyos y ronda de 18,
  // `(CR − 36)` inflaría el course handicap ~36 golpes.
  const faltantes = Math.max(0, roundHoles - cargados.length)
  return suma + faltantes * 4
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
 * ¿El par y el Course Rating de esta cancha vienen en escala de 18 hoyos?
 *
 * FUENTE ÚNICA de la decisión de escala. El par es la señal confiable: es un
 * entero duro (35-36 en una cancha de 9, 70-72 en una de 18) y nunca ambiguo.
 * El Course Rating es un float que puede venir sucio del catálogo, así que NO
 * decide — obedece.
 *
 * Existe porque esta pregunta estaba contestada en tres lugares con tres
 * criterios distintos: `resolveNineHolePar` guardaba el par con `≤50`, los dos
 * caminos de `resolverCourseData` partían el CR SIN guarda, y el coach partía
 * el par SIN guarda. Con criterios que no coinciden, el par y el CR terminan en
 * escalas distintas dentro de la MISMA fórmula — que es exactamente el bug de
 * los course handicaps negativos, sólo que por el otro lado.
 */
export function esEscalaDe18Hoyos(par: number): boolean {
  return par > 50
}

/**
 * Par de la vuelta de 9 hoyos, desde el par de la cancha.
 *
 * Un par ≤50 ya es de 9 hoyos y se respeta tal cual (C.G. Río Blanco: par 35).
 * Uno mayor es de 18 y se parte al medio.
 */
export function parEnEscalaDe9(par: number): number {
  return esEscalaDe18Hoyos(par) ? Math.round(par / 2) : par
}

/**
 * Course Rating de la vuelta de 9 hoyos, en la MISMA escala que `parEnEscalaDe9`.
 *
 * ⚠️ Toma el par de la cancha como señal de escala, no su propia magnitud. Un
 * umbral propio sobre el CR (`rating > 50 ? /2 : rating`) parece razonable y es
 * falso: C.G. Río Blanco tiene par 35 (9 hoyos) con rating 55, así que un
 * umbral sobre el rating lo partiría a 27.5 contra un par de 35 y devolvería
 * `(27.5 − 35)` → course handicap NEGATIVO para un jugador de índice 12.
 *
 * Si el tee publica `front_course_rating` usá ESE valor y no esta función: ya
 * es un CR de 9 hoyos medido, no una aproximación.
 */
export function courseRatingEnEscalaDe9(courseRating: number, parDeLaCancha: number): number {
  return esEscalaDe18Hoyos(parDeLaCancha) ? courseRating / 2 : courseRating
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
      const crSum = children.reduce((s, c) => s + (c.course_rating ?? 0), 0)
      const parSum = children.reduce((s, c) => s + (c.par_total ?? 36), 0)
      const slopeAvg = children.length > 0
        ? Math.round(children.reduce((s, c) => s + (c.slope_rating ?? 113), 0) / children.length)
        : 113
      const allHaveRatings = children.every(c => c.course_rating && c.slope_rating)
      if (allHaveRatings) {
        return {
          slope: slopeAvg,
          courseRating: crSum,
          par: parTotal ?? parSum,
          is9Hole: recorridos.length === 1,
        }
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
        const crSumTee = teeRows.reduce((s, t) => s + (t.front_course_rating ?? t.rating ?? 0), 0)
        const slopeAvgTee = Math.round(
          teeRows.reduce((s, t) => s + (t.front_slope_rating ?? t.slope ?? 113), 0) / teeRows.length
        )
        if (crSumTee > 0 && slopeAvgTee > 0) {
          return {
            slope: slopeAvgTee,
            courseRating: crSumTee,
            par: parTotal ?? parSum,
            is9Hole: recorridos.length === 1,
          }
        }
      }
      // Si data insuficiente en children → caer al flujo single-course.
    }
  }

  // 1. Intentar CR/Slope específico del tee (más preciso)
  const teeNorm = tees.toLowerCase()
  const { data: teeData } = await supabase
    .from('course_tees')
    .select('rating, slope, front_course_rating, front_slope_rating')
    .eq('course_id', courseId)
    .ilike('nombre', `${teeNorm}%`)
    .limit(1)
    .maybeSingle()

  if (teeData?.rating && teeData?.slope) {
    if (holes <= 9) {
      // Ronda de 9h. Con ratings de front-9 publicados, usarlos tal cual. Sin
      // ellos (288 de 477 tees del catálogo, ~60%), aproximación WHS: slope9≈slope18,
      // CR9=CR18/2, par del front-9 real. En AMBOS caminos is9Hole=true, para que
      // resolverCourseHandicap divida el índice por 2 (Rule 6.1). Sin el flag el
      // jugador recibía ~2× los golpes — mismo criterio que el fallback courses (abajo).
      const hasFront9 = teeData.front_course_rating != null && teeData.front_slope_rating != null
      // Señal de escala del rating del tee: el par PROPIO de la cancha. El
      // `parTotal` que llega es el par de la RONDA y puede venir ya dividido
      // (36), así que no distingue media cancha de 72 de una cancha de 9 hoyos
      // reales. Sin la fila de courses se asume 18h — el comportamiento previo.
      const { data: courseRow } = hasFront9
        ? { data: null }
        : await supabase.from('courses').select('par_total').eq('id', courseId).maybeSingle()
      return {
        slope: hasFront9 ? teeData.front_slope_rating! : teeData.slope,
        courseRating: hasFront9
          ? teeData.front_course_rating!
          : courseRatingEnEscalaDe9(teeData.rating, courseRow?.par_total ?? 72),
        par: await resolveNineHolePar(supabase, courseId, parTotal),
        is9Hole: true,
      }
    }
    return {
      slope: teeData.slope,
      courseRating: teeData.rating,
      par: parTotal ?? 72,
    }
  }

  // 2. Fallback: tabla courses
  const { data: course } = await supabase
    .from('courses')
    .select('slope_rating, course_rating, par_total')
    .eq('id', courseId)
    .maybeSingle()

  if (course?.slope_rating && course?.course_rating) {
    if (holes <= 9) {
      // Sin CR/slope de 9h en la tabla courses: aprox. WHS (CR/2), mismo criterio
      // que indice-golfers.ts. El par debe ser de 9 hoyos, NO de 18.
      return {
        slope: course.slope_rating,
        // Acá sí tenemos el par PROPIO de la cancha en la mano: esa es la señal
        // de escala, y tiene prioridad sobre el `parTotal` de la ronda.
        courseRating: courseRatingEnEscalaDe9(course.course_rating, course.par_total ?? parTotal ?? 72),
        par: await resolveNineHolePar(supabase, courseId, parTotal ?? course.par_total ?? undefined),
        is9Hole: true,
      }
    }
    return {
      slope: course.slope_rating,
      courseRating: course.course_rating,
      par: parTotal ?? course.par_total ?? 72,
    }
  }

  return null
}
