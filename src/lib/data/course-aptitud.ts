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
  aptitudPorHoyos,
  type AptitudPorHoyos,
  type CanchaParaAptitud,
} from '@/golf/courses/aptitud-torneo'

/** Columnas de `courses` que necesita el veredicto. Fuente única del SELECT. */
export const COLUMNAS_APTITUD_COURSES = 'par_total, course_rating'

/** Columnas de `course_tees` que necesita el veredicto. */
export const COLUMNAS_APTITUD_TEES = 'course_id, rating, front_course_rating'

/**
 * PostgREST corta en 1.000 filas por defecto. El catálogo tiene 477 tees hoy,
 * pero una lista truncada NO da error: deja canchas sin sus tees y el veredicto
 * cambia en silencio (mismo modo de falla que el bug de paginación del #254).
 * Se pide el rango explícito para que crecer el catálogo no rompa nada.
 */
const MAX_TEES = 10_000

export interface CourseRowParaAptitud {
  id: string
  nombre?: string | null
  par_total: number | null
  course_rating: number | null
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

/** Todos los tees del catálogo, sin el corte silencioso de PostgREST. */
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
 * Devuelve un Map por id. Las canchas que no existen simplemente no aparecen:
 * el caller decide si eso es un error suyo o no.
 */
export async function fetchCanchasParaAptitud(
  supabase: MinimalClient,
  courseIds: string[],
): Promise<Map<string, CanchaConRatings>> {
  const ids = Array.from(new Set(courseIds.filter((id): id is string => !!id)))
  if (ids.length === 0) return new Map()

  const [{ data: courses }, { data: tees }] = await Promise.all([
    supabase.from('courses').select(`id, nombre, ${COLUMNAS_APTITUD_COURSES}`).in('id', ids),
    supabase.from('course_tees').select(COLUMNAS_APTITUD_TEES).in('course_id', ids),
  ])

  return armarCanchasParaAptitud(
    (courses ?? []) as unknown as CourseRowParaAptitud[],
    (tees ?? []) as unknown as TeeRowParaAptitud[],
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
  mensaje: string
}

/**
 * Gate de creación de torneo: devuelve las rondas cuya cancha no es apta.
 *
 * Vacío = se puede crear. Las rondas sin `course_id` no se juzgan acá — de eso
 * ya se ocupa `validateGolfRules` (`round_course_required`).
 */
export async function canchasNoAptasParaTorneo(
  supabase: MinimalClient,
  rounds: RondaParaAptitud[],
): Promise<RondaNoApta[]> {
  const conCancha = rounds.filter((r): r is RondaParaAptitud & { course_id: string } => !!r.course_id)
  if (conCancha.length === 0) return []

  const canchas = await fetchCanchasParaAptitud(supabase, conCancha.map((r) => r.course_id))

  const out: RondaNoApta[] = []
  conCancha.forEach((ronda, idx) => {
    const cancha = canchas.get(ronda.course_id)
    // Cancha inexistente: no es asunto de este guardarrail (la FK lo caza).
    if (!cancha) return
    const veredicto = evaluarAptitudTorneo(cancha, ronda.hole_count)
    if (!veredicto.apta && veredicto.mensaje) {
      out.push({
        round_number: ronda.round_number ?? idx + 1,
        course_id: ronda.course_id,
        cancha: cancha.nombre,
        mensaje: veredicto.mensaje,
      })
    }
  })
  return out
}
