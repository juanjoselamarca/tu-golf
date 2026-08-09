// src/lib/data/course-aptitud.ts
//
// Capa de datos del guardarrail de rating: trae de la BD lo mínimo que
// `evaluarAptitudTorneo` necesita (par, rating de la cancha, rating de cada
// tee) y arma el veredicto por cancha.
//
// Vive acá y no en las rutas para que el wizard, el gate del servidor y el de
// ronda libre pregunten todos lo mismo, con las mismas columnas.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluarAptitudTorneo,
  evaluarAptitudRecorridos,
  evaluarParPorHoyo,
  combinarVeredictos,
  aptitudPorHoyos,
  requiereRatingDeCancha,
  type AptitudPorHoyos,
  type AptitudTorneo,
  type CanchaParaAptitud,
  type MotivoNoApta,
  type ParPorHoyoDisponible,
} from '@/golf/courses/aptitud-torneo'

/**
 * Columnas de `courses` que necesita el veredicto. Fuente única del SELECT.
 * `slope_rating` es sólo para espejar el `allHaveRatings` del motor en las
 * canchas multi-recorrido.
 */
export const COLUMNAS_APTITUD_COURSES = 'par_total, course_rating, slope_rating'

/** Columnas de `course_tees` que necesita el veredicto. */
export const COLUMNAS_APTITUD_TEES = 'course_id, rating, front_course_rating'

/**
 * PostgREST corta en 1.000 filas por defecto. El catálogo tiene 477 tees hoy,
 * pero una lista truncada NO da error: deja canchas sin sus tees y el veredicto
 * cambia en silencio (mismo modo de falla que el bug de paginación del #254).
 * Se pide el rango explícito para que crecer el catálogo no rompa nada.
 */
const MAX_TEES = 10_000

/**
 * Mismo motivo que `MAX_TEES`, para `course_holes`: 27 hoyos por complejo es el
 * máximo real, pero un corte silencioso acá haría que un recorrido con hoyos
 * pareciera no tenerlos y el gate bloquearía una cancha sana.
 */
const MAX_HOYOS = 10_000

export interface CourseRowParaAptitud {
  id: string
  nombre?: string | null
  par_total: number | null
  course_rating: number | null
  slope_rating?: number | null
}

export interface TeeRowParaAptitud {
  course_id: string
  rating: number | null
  front_course_rating: number | null
}

export interface CanchaConRatings extends CanchaParaAptitud {
  id: string
  nombre: string
}

/** Cliente mínimo que necesita este módulo (sirve anon, ssr o service role). */
type MinimalClient = Pick<SupabaseClient, 'from'>

/**
 * Junta filas de `courses` con sus tees. Pura, sin I/O: los callers que ya
 * trajeron las canchas por otro motivo (el wizard las lista igual) no pagan
 * una segunda consulta.
 */
export function armarCanchasParaAptitud(
  courses: CourseRowParaAptitud[],
  tees: TeeRowParaAptitud[],
): Map<string, CanchaConRatings> {
  const out = new Map<string, CanchaConRatings>()
  for (const c of courses) {
    out.set(c.id, {
      id: c.id,
      nombre: c.nombre ?? '',
      par_total: c.par_total ?? null,
      course_rating: c.course_rating ?? null,
      slope_rating: c.slope_rating ?? null,
      tees: [],
    })
  }
  for (const t of tees) {
    const cancha = out.get(t.course_id)
    if (!cancha) continue
    cancha.tees!.push({
      rating: t.rating ?? null,
      front_course_rating: t.front_course_rating ?? null,
    })
  }
  return out
}

/**
 * Veredicto precalculado para las dos duraciones del wizard, por cancha.
 * Pura: se le pasan las filas ya traídas.
 */
export function aptitudDeCatalogo(
  courses: CourseRowParaAptitud[],
  tees: TeeRowParaAptitud[],
): Map<string, AptitudPorHoyos> {
  const canchas = armarCanchasParaAptitud(courses, tees)
  const out = new Map<string, AptitudPorHoyos>()
  canchas.forEach((cancha, id) => out.set(id, aptitudPorHoyos(cancha)))
  return out
}

/**
 * `supabase-js` NO lanza cuando la query falla: devuelve `{ data: null, error }`.
 * Tragarse ese error acá haría que el gate falle ABIERTO — un timeout de
 * PostgREST o un cambio de RLS devolvería "cancha sin ratings", que es
 * justamente el caso que se deja pasar. Los caminos de gate usan esto.
 */
function exigirFilas<T>(
  { data, error }: { data: unknown; error: { message?: string } | null },
  que: string,
): T[] {
  if (error) throw new Error(`No se pudo leer ${que}: ${error.message ?? 'error desconocido'}`)
  return (data ?? []) as T[]
}

/**
 * Todos los tees del catálogo, sin el corte silencioso de PostgREST.
 *
 * Camino ADVISORY (el aviso del wizard): si la consulta falla se devuelve vacío
 * y el wizard no pinta el aviso. No se rompe la página por eso — el gate del
 * servidor sigue siendo la puerta dura y ése sí falla cerrado.
 */
export async function fetchTeesParaAptitud(
  supabase: MinimalClient,
): Promise<TeeRowParaAptitud[]> {
  const { data } = await supabase
    .from('course_tees')
    .select(COLUMNAS_APTITUD_TEES)
    .range(0, MAX_TEES - 1)
  return (data ?? []) as unknown as TeeRowParaAptitud[]
}

/**
 * Trae par + ratings (cancha y tees) de las canchas pedidas.
 *
 * Camino de GATE: lanza si la BD falla. Las canchas que no existen simplemente
 * no aparecen — eso no es un error de acá (la FK lo caza).
 */
export async function fetchCanchasParaAptitud(
  supabase: MinimalClient,
  courseIds: string[],
): Promise<Map<string, CanchaConRatings>> {
  const ids = Array.from(new Set(courseIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return new Map()

  const [resCourses, resTees] = await Promise.all([
    supabase.from('courses').select(`id, nombre, ${COLUMNAS_APTITUD_COURSES}`).in('id', ids),
    supabase.from('course_tees').select(COLUMNAS_APTITUD_TEES).in('course_id', ids).range(0, MAX_TEES - 1),
  ])

  return armarCanchasParaAptitud(
    exigirFilas<CourseRowParaAptitud>(resCourses, 'las canchas'),
    exigirFilas<TeeRowParaAptitud>(resTees, 'los tees de la cancha'),
  )
}

/**
 * Los recorridos (hijos) de una cancha multi-recorrido, para el caso en que el
 * jugador elige loops sueltos. El selector sólo ofrece la cancha PADRE, así que
 * sin esto el guardarrail juzga al padre — que en producción está sano — y deja
 * pasar los 9 loops rotos de Brisas / Marbella / Rocas.
 *
 * Camino de GATE: lanza si la BD falla.
 */
export async function fetchRecorridosParaAptitud(
  supabase: MinimalClient,
  parentId: string,
  loopNombres: string[],
): Promise<CanchaConRatings[]> {
  if (loopNombres.length === 0) return []
  const res = await supabase
    .from('courses')
    .select(`id, nombre, ${COLUMNAS_APTITUD_COURSES}`)
    .eq('parent_id', parentId)
    .in('loop_nombre', loopNombres)
  const hijos = exigirFilas<CourseRowParaAptitud>(res, 'los recorridos de la cancha')
  // El motor sólo entra por la rama multi-recorrido cuando encuentra TODOS los
  // loops pedidos (`children.length === recorridos.length`). Si faltan, cae al
  // camino de cancha simple y este veredicto no aplica.
  if (hijos.length !== loopNombres.length) return []

  // Los tees de los HIJOS: el motor los usa como segundo intento cuando algún
  // loop no tiene `course_rating`. Sin ellos el gate se quedaba ciego en esa
  // rama (mismo agujero que tenía con la cancha padre, un nivel más abajo).
  const resTees = await supabase
    .from('course_tees')
    .select(COLUMNAS_APTITUD_TEES)
    .in('course_id', hijos.map((h) => h.id))
    .range(0, MAX_TEES - 1)

  const conTees = armarCanchasParaAptitud(
    hijos,
    exigirFilas<TeeRowParaAptitud>(resTees, 'los tees de los recorridos'),
  )
  return hijos.map((h) => conTees.get(h.id)!)
}

/**
 * Veredicto para una ronda libre, que a diferencia de un torneo puede elegir
 * recorridos sueltos de una cancha multi-recorrido.
 *
 * Devuelve `null` cuando la cancha no está en la BD (cancha libre escrita a
 * mano): ahí no hay rating que desmentir.
 */
export async function evaluarCanchaDeRondaLibre(
  supabase: MinimalClient,
  courseId: string,
  holes: number,
  recorridos: string[] | null,
): Promise<AptitudTorneo | null> {
  if (recorridos && recorridos.length > 0) {
    const loops = await fetchRecorridosParaAptitud(supabase, courseId, recorridos)
    // `[]` = el motor no va a usar la rama multi-recorrido (le faltan loops):
    // se juzga la cancha simple, igual que hará él.
    if (loops.length > 0) return evaluarAptitudRecorridos(loops)
  }

  const canchas = await fetchCanchasParaAptitud(supabase, [courseId])
  const cancha = canchas.get(courseId)
  return cancha ? evaluarAptitudTorneo(cancha, holes) : null
}

/**
 * De dónde puede salir el par hoyo por hoyo de esta ronda: de la cancha misma
 * o de los recorridos elegidos.
 *
 * Camino de GATE: lanza si la BD falla. El caller decide si eso frena la ronda
 * (creación de torneo, desde un escritorio) o si se deja pasar (ronda libre,
 * con el jugador parado en el tee 1).
 */
export async function fetchParPorHoyoDisponible(
  supabase: MinimalClient,
  courseId: string,
  recorridos: string[] | null,
): Promise<ParPorHoyoDisponible> {
  const loopsPedidos = recorridos ?? []

  const [resHijos, resHoyosPropios] = await Promise.all([
    supabase.from('courses').select('id, loop_nombre').eq('parent_id', courseId),
    // Basta una fila para saber que la cancha tiene su par cargado.
    supabase.from('course_holes').select('course_id').eq('course_id', courseId).range(0, 0),
  ])

  const hijos = exigirFilas<{ id: string; loop_nombre: string | null }>(
    resHijos,
    'los recorridos de la cancha',
  )
  const hoyosPropios =
    exigirFilas<{ course_id: string }>(resHoyosPropios, 'los hoyos de la cancha').length > 0

  const base = {
    hoyosPropios,
    loopsElegidos: loopsPedidos.length,
    recorridosDisponibles: hijos.length,
  }
  if (loopsPedidos.length === 0) return { ...base, loopsConHoyos: 0 }

  const elegidos = hijos.filter((h) => h.loop_nombre != null && loopsPedidos.includes(h.loop_nombre))
  if (elegidos.length === 0) return { ...base, loopsConHoyos: 0 }

  const resHoyosHijos = await supabase
    .from('course_holes')
    .select('course_id')
    .in('course_id', elegidos.map((h) => h.id))
    .range(0, MAX_HOYOS - 1)
  const conHoyos = new Set(
    exigirFilas<{ course_id: string }>(resHoyosHijos, 'los hoyos de los recorridos').map(
      (h) => h.course_id,
    ),
  )

  return { ...base, loopsConHoyos: elegidos.filter((h) => conHoyos.has(h.id)).length }
}

/**
 * ¿Puede empezar esta ronda libre?
 *
 * Junta las dos preguntas del guardarrail de cancha, que NO aplican en el mismo
 * momento:
 * - El par hoyo por hoyo hace falta SIEMPRE. Sin él no hay vs-par ni birdie en
 *   el scorer, se juegue gross o neto.
 * - El rating sólo hace falta cuando se juega NETO: en gross no entra en ningún
 *   cálculo y bloquear por él sería un falso bloqueo.
 *
 * Se compone acá y no en la ruta para que un segundo camino de creación no
 * tenga que volver a acordarse del matiz.
 */
export async function evaluarRondaLibre(
  supabase: MinimalClient,
  courseId: string,
  holes: number,
  recorridos: string[] | null,
  opciones: { requiereRating: boolean },
): Promise<AptitudTorneo> {
  const disponible = await fetchParPorHoyoDisponible(supabase, courseId, recorridos)
  const porHoyo = evaluarParPorHoyo(disponible)

  // El par por hoyo va primero: es el requisito más básico y su mensaje es el
  // más accionable de los dos ("elige tus recorridos").
  if (!opciones.requiereRating) return porHoyo

  return combinarVeredictos(
    porHoyo,
    await evaluarCanchaDeRondaLibre(supabase, courseId, holes, recorridos),
  )
}

/** Lo mínimo que hace falta de una ronda para juzgar su cancha. */
export interface RondaParaAptitud {
  round_number?: number
  course_id: string | null
  hole_count: number
}

export interface RondaNoApta {
  round_number: number
  course_id: string
  cancha: string
  motivo: MotivoNoApta
  mensaje: string
}

/**
 * Gate de creación de torneo: devuelve las rondas cuya cancha no es apta.
 *
 * Vacío = se puede crear. Las rondas sin `course_id` no se juzgan acá — de eso
 * ya se ocupa `validateGolfRules` (`round_course_required`).
 *
 * `torneo` es obligatorio a propósito: un torneo Gross no usa el Course Rating
 * para nada y bloquearlo sería un falso bloqueo. Que el caller tenga que
 * declararlo evita que una ruta nueva se olvide del matiz.
 */
export async function canchasNoAptasParaTorneo(
  supabase: MinimalClient,
  rounds: RondaParaAptitud[],
  torneo: { modo?: string | null; use_handicap?: boolean | null },
): Promise<RondaNoApta[]> {
  const conCancha = rounds.filter((r): r is RondaParaAptitud & { course_id: string } => !!r.course_id)
  if (conCancha.length === 0) return []

  const ids = conCancha.map((r) => r.course_id)
  // El rating sólo se juzga si el torneo lo usa; el par por hoyo, siempre. Sin
  // el `if` los 9 torneos Gross de producción sobre canchas sin rating serían
  // un falso bloqueo — y sin el segundo fetch, un torneo Gross sobre una cancha
  // sin par por hoyo se crearía igual y rompería en el hoyo 1.
  const [canchas, parPorHoyo] = await Promise.all([
    requiereRatingDeCancha(torneo)
      ? fetchCanchasParaAptitud(supabase, ids)
      : Promise.resolve(new Map<string, CanchaConRatings>()),
    fetchParPorHoyoDeCanchas(supabase, ids),
  ])

  const out: RondaNoApta[] = []
  conCancha.forEach((ronda, idx) => {
    const disponible = parPorHoyo.get(ronda.course_id)
    // Cancha inexistente: no es asunto de este guardarrail (la FK lo caza).
    // `fetchParPorHoyoDeCanchas` sólo devuelve entrada para las que existen,
    // que es lo que distingue "no está en la BD" de "está y no tiene hoyos".
    if (!disponible) return

    const cancha = canchas.get(ronda.course_id)
    const veredicto = combinarVeredictos(
      // Un torneo NO elige recorridos (`tournaments` no tiene la columna), así
      // que el par tiene que salir de la cancha misma. Para los complejos de 27
      // el catálogo ya ofrece la combinación armada ("Norte - Sur", 18 hoyos
      // cargados); es ésa la que hay que elegir, no el club padre.
      evaluarParPorHoyo(disponible),
      cancha ? evaluarAptitudTorneo(cancha, ronda.hole_count) : null,
    )
    if (!veredicto.apta && veredicto.motivo && veredicto.mensaje) {
      out.push({
        round_number: ronda.round_number ?? idx + 1,
        course_id: ronda.course_id,
        cancha: disponible.nombre,
        motivo: veredicto.motivo,
        mensaje: veredicto.mensaje,
      })
    }
  })
  return out
}

/**
 * Par por hoyo de varias canchas de una vez, para el gate de torneo (que puede
 * tener una cancha distinta por ronda). No mira recorridos: un torneo no los
 * elige.
 *
 * Sólo devuelve entrada para las canchas que EXISTEN. Un id que no está en
 * `courses` no es asunto de este guardarrail — de eso se ocupa la FK — y
 * devolverlo como "sin par por hoyo" lo convertiría en un bloqueo con el
 * mensaje equivocado.
 */
async function fetchParPorHoyoDeCanchas(
  supabase: MinimalClient,
  courseIds: string[],
): Promise<Map<string, ParPorHoyoDisponible & { nombre: string }>> {
  const ids = Array.from(new Set(courseIds))
  const [resCanchas, resHoyos, resHijos] = await Promise.all([
    supabase.from('courses').select('id, nombre').in('id', ids),
    supabase.from('course_holes').select('course_id').in('course_id', ids).range(0, MAX_HOYOS - 1),
    supabase.from('courses').select('id, parent_id').in('parent_id', ids),
  ])

  const existentes = exigirFilas<{ id: string; nombre: string | null }>(resCanchas, 'las canchas')
  const conHoyos = new Set(
    exigirFilas<{ course_id: string }>(resHoyos, 'los hoyos de las canchas').map((h) => h.course_id),
  )
  const hijosPorPadre = new Map<string, number>()
  for (const h of exigirFilas<{ parent_id: string | null }>(resHijos, 'los recorridos de las canchas')) {
    if (h.parent_id) hijosPorPadre.set(h.parent_id, (hijosPorPadre.get(h.parent_id) ?? 0) + 1)
  }

  return new Map(
    existentes.map((c) => [
      c.id,
      {
        nombre: c.nombre ?? '',
        hoyosPropios: conHoyos.has(c.id),
        loopsElegidos: 0,
        loopsConHoyos: 0,
        recorridosDisponibles: hijosPorPadre.get(c.id) ?? 0,
      },
    ]),
  )
}
