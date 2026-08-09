// src/lib/data/course-aptitud.ts
//
// Capa de datos del guardarrail de rating: trae de la BD lo mínimo que
// `evaluarAptitudTorneo` necesita (par, rating de la cancha, rating de cada
// tee) y arma el veredicto por cancha.
//
// Vive acá y no en las rutas para que el wizard, el gate del servidor y el de
// ronda libre pregunten todos lo mismo, con las mismas columnas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverHoyosDeLaRonda } from './course-holes'
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
 * ⚠️ Pedir un `.range()` grande NO levanta el techo de PostgREST: `db-max-rows`
 * lo aplica el servidor y hoy corta en 1.000 filas, sin avisar. Medido contra
 * producción: `GET /course_holes?select=id` con `Range: 0-9999` devuelve 1.000
 * de 3.231 filas.
 *
 * Estos topes NO protegen de ese corte. Sirven sólo para que el pedido sea
 * explícito y para documentar el orden de magnitud esperado. Lo que mantiene
 * correctas a estas funciones es que TODAS filtran por un `in(...)` acotado a
 * las canchas de la ronda o del torneo (1-4 canchas → ≤ 72 hoyos, ≤ ~20 tees),
 * muy por debajo del techo.
 *
 * Si algún caller futuro pide el catálogo entero por acá, hay que paginar como
 * hace `catalogo-par-por-hoyo.canary.test.ts`. Una lista truncada no da error:
 * dejaría una cancha sana sin sus hoyos y el gate la bloquearía en silencio.
 */
const MAX_TEES = 10_000

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
  puedeElegirRecorridos: boolean,
): Promise<ParPorHoyoDisponible> {
  const loopsPedidos = (recorridos ?? []).filter((r): r is string => !!r)
  // Deduplicado: el schema acepta `['Este','Este']` y contarlo dos veces daría
  // un veredicto distinto que la resolución real, que agrupa por loop.
  const loopsUnicos = Array.from(new Set(loopsPedidos))

  const [resuelto, resHijos, resExiste] = await Promise.all([
    // LA MISMA función que corre en el scorer. Preguntarle a ella —y no volver
    // a derivarlo del catálogo— es lo que garantiza que el gate no pueda
    // contestar distinto que el motor.
    //
    // `lanzarSiFalla` es lo que mantiene el contrato de GATE: sin eso un
    // timeout de `course_holes` devolvería `[]`, el gate leería "0 hoyos" y
    // bloquearía la ronda con un mensaje que miente, sin pasar por el `.catch()`
    // de la ruta que reporta a Sentry y abre el paso.
    resolverHoyosDeLaRonda(supabase, courseId, loopsUnicos, {
      columnas: COLUMNAS_HOYOS_PARA_GATE,
      lanzarSiFalla: true,
    }),
    supabase.from('courses').select('id').eq('parent_id', courseId),
    supabase.from('courses').select('id').eq('id', courseId),
  ])

  return {
    hoyosResueltos: resuelto.hoyos.length,
    loopsElegidos: loopsUnicos.length,
    loopsResueltos: resuelto.loopsResueltos,
    recorridosDisponibles: exigirFilas<{ id: string }>(resHijos, 'los recorridos de la cancha')
      .length,
    puedeElegirRecorridos,
    existe: exigirFilas<{ id: string }>(resExiste, 'la cancha').length > 0,
  }
}

/**
 * El gate sólo necesita saber CUÁNTOS hoyos salen, no sus yardajes. Se pide el
 * mínimo para no arrastrar 9 columnas por una pregunta que es un conteo.
 */
const COLUMNAS_HOYOS_PARA_GATE = 'numero, par, stroke_index, recorrido'

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
  // El wizard de ronda libre SÍ ofrece elegir recorridos, así que el mensaje
  // puede pedir esa acción.
  const disponible = await fetchParPorHoyoDisponible(supabase, courseId, recorridos, true)
  const porHoyo = evaluarParPorHoyo(disponible)

  // El par por hoyo va primero: es el requisito más básico y su mensaje es el
  // más accionable. Si ya bloquea, no se paga el fetch del rating — son 2
  // round-trips más en una ruta que corre con el jugador parado en el tee 1.
  if (!porHoyo.apta || !opciones.requiereRating) return porHoyo

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
  const [resCanchas, resHijos, resueltos] = await Promise.all([
    supabase.from('courses').select('id, nombre').in('id', ids),
    supabase.from('courses').select('id, parent_id').in('parent_id', ids),
    // Un torneo no elige recorridos, así que cada cancha se resuelve con la
    // vía 1 del MISMO resolver que usa el scorer. Contar filas de
    // `course_holes` en batch daba hoy el mismo resultado, pero era la última
    // derivación paralela que quedaba — y bastaba con que el resolver ganara
    // una condición para que volvieran a divergir, que es el bug que este PR
    // cierra. Un torneo tiene 1-4 rondas, así que el fan-out es trivial.
    Promise.all(
      ids.map((id) =>
        resolverHoyosDeLaRonda(supabase, id, null, {
          columnas: COLUMNAS_HOYOS_PARA_GATE,
          lanzarSiFalla: true,
        }).then((r) => [id, r.hoyos.length] as const),
      ),
    ),
  ])

  const existentes = exigirFilas<{ id: string; nombre: string | null }>(resCanchas, 'las canchas')
  const hoyosPorCancha = new Map(resueltos)
  const hijosPorPadre = new Map<string, number>()
  for (const h of exigirFilas<{ parent_id: string | null }>(resHijos, 'los recorridos de las canchas')) {
    if (h.parent_id) hijosPorPadre.set(h.parent_id, (hijosPorPadre.get(h.parent_id) ?? 0) + 1)
  }

  return new Map(
    existentes.map((c) => [
      c.id,
      {
        nombre: c.nombre ?? '',
        hoyosResueltos: hoyosPorCancha.get(c.id) ?? 0,
        // Sin recorridos elegidos, "todos los elegidos resueltos" es trivial.
        loopsElegidos: 0,
        loopsResueltos: 0,
        recorridosDisponibles: hijosPorPadre.get(c.id) ?? 0,
        // El wizard de torneos no tiene dónde elegir recorridos.
        puedeElegirRecorridos: false,
        // La Map se arma sólo con las canchas que volvieron de `courses`.
        existe: true,
      },
    ]),
  )
}
