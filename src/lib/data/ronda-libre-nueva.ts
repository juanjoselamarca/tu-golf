/**
 * Acceso a datos del asistente "Nueva ronda libre".
 *
 * Existe para sacar los `supabase.from(...)` de `app/ronda-libre/nueva/page.tsx`
 * (regla "el que toca, ordena"). La página ya no sabe de tablas: pide conceptos.
 */

import { createClient } from '@/lib/supabase'

export interface PerfilCreador {
  nombre: string
  indice: number | null
}

export interface RondaReciente {
  course_name: string
  course_id: string | null
  tees: string
  holes: number
  formato_juego: string | null
  modo_juego: string | null
  fecha: string
  jugadores: string[]
}

/** Fila hija de `courses`: cada recorrido de una cancha 27/36h. */
interface HijoDeCancha {
  id: string
  loop_nombre: string | null
  par_total: number | null
}

/** Un recorrido de 9 (o más) hoyos dentro de una cancha multi-loop. */
export interface CourseLoop {
  recorrido: string
  holes: number
  par: number
}

export interface CourseDetails {
  par_total: number | null
  course_rating: number | null
  slope_rating: number | null
  has_holes: boolean
}

export interface CourseTee {
  nombre: string
  yardaje_total: number | null
  rating: number | null
  slope: number | null
}

/** Todo lo que el asistente necesita saber de una cancha, en una sola pasada. */
export interface SetupDeCancha {
  details: CourseDetails | null
  tees: CourseTee[]
  loops: CourseLoop[]
}

export const SETUP_DE_CANCHA_VACIO: SetupDeCancha = { details: null, tees: [], loops: [] }

/**
 * Nombre e índice del creador. `fallback` cubre al usuario recién registrado
 * cuyo `profiles.name` todavía está vacío.
 */
export async function fetchPerfilCreador(
  userId: string,
  fallback: string,
): Promise<PerfilCreador> {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('name, indice')
    .eq('id', userId)
    .single()

  return {
    nombre: data?.name || fallback,
    indice: data?.indice ?? null,
  }
}

/**
 * Últimas rondas finalizadas del creador, para el atajo "jugar como la última vez".
 */
export async function fetchRondasRecientes(
  userId: string,
  limite = 3,
): Promise<RondaReciente[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('rondas_libres')
    .select('course_name, course_id, tees, holes, formato_juego, modo_juego, fecha, ronda_libre_jugadores(nombre)')
    .eq('creador_id', userId)
    .eq('estado', 'finalizada')
    .order('fecha', { ascending: false })
    .limit(limite)

  if (!data) return []

  return data.map(r => ({
    course_name: r.course_name,
    course_id: r.course_id,
    tees: r.tees,
    holes: r.holes,
    formato_juego: r.formato_juego,
    modo_juego: r.modo_juego,
    fecha: r.fecha,
    jugadores: (r.ronda_libre_jugadores as Array<{ nombre: string }> | null ?? []).map(j => j.nombre),
  }))
}

/**
 * Detalles, tees y recorridos de una cancha.
 *
 * Los recorridos salen de los `courses` hijos (modelo actual) y, si no hay, de
 * la columna `recorrido` de `course_holes` (modelo legacy). Devuelve lista vacía
 * salvo que haya AL MENOS DOS recorridos jugables: con uno solo no hay nada que
 * elegir, y la UI de combinaciones no debe aparecer.
 */
export async function fetchSetupDeCancha(courseId: string): Promise<SetupDeCancha> {
  const supabase = createClient()

  const [
    { data: course },
    { count: holeCount },
    { data: tees },
    { data: children },
  ] = await Promise.all([
    supabase.from('courses').select('par_total, course_rating, slope_rating').eq('id', courseId).single(),
    supabase.from('course_holes').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
    supabase.from('course_tees').select('nombre, yardaje_total, rating, slope').eq('course_id', courseId).order('yardaje_total', { ascending: false }),
    supabase.from('courses').select('id, loop_nombre, par_total').eq('parent_id', courseId).order('loop_nombre'),
  ])

  const details: CourseDetails | null = course
    ? {
        par_total: course.par_total,
        course_rating: course.course_rating,
        slope_rating: course.slope_rating,
        has_holes: (holeCount || 0) > 0,
      }
    : null

  const loops = children && children.length >= 2
    ? await loopsDesdeHijos(courseId, children as HijoDeCancha[])
    : await loopsDesdeHoyos(courseId)

  return { details, tees: (tees as CourseTee[]) || [], loops }
}

/** Modelo actual: cada recorrido es una fila hija de `courses`. */
async function loopsDesdeHijos(courseId: string, children: HijoDeCancha[]): Promise<CourseLoop[]> {
  const supabase = createClient()
  const { data: allChildHoles } = await supabase
    .from('course_holes')
    .select('course_id')
    .in('course_id', children.map(c => c.id))

  const holeCountMap = new Map<string, number>()
  for (const h of allChildHoles ?? []) {
    holeCountMap.set(h.course_id, (holeCountMap.get(h.course_id) ?? 0) + 1)
  }

  const validos: CourseLoop[] = []
  for (const child of children) {
    const count = holeCountMap.get(child.id) ?? 0
    if (count >= 9 && child.loop_nombre) {
      validos.push({ recorrido: child.loop_nombre, holes: count, par: child.par_total ?? 36 })
    }
  }
  // Con hijos cargados, los hijos mandan: si ninguno tiene 9 hoyos, la cancha no
  // ofrece recorridos elegibles. NO se cae al modelo legacy — el padre de una
  // cancha con hijos no tiene los hoyos de los recorridos, y mezclar los dos
  // modelos haría aparecer combinaciones que el motor de scoring no sabe leer.
  return validos.length >= 2 ? ordenados(validos) : []
}

/** Modelo legacy: los recorridos viven en `course_holes.recorrido` del padre. */
async function loopsDesdeHoyos(courseId: string): Promise<CourseLoop[]> {
  const supabase = createClient()
  const { data: holeRows } = await supabase
    .from('course_holes')
    .select('recorrido, par')
    .eq('course_id', courseId)

  if (!holeRows || holeRows.length === 0) return []

  const loopMap = new Map<string, { count: number; par: number }>()
  for (const h of holeRows) {
    const r = (h.recorrido as string) || 'default'
    const previo = loopMap.get(r) ?? { count: 0, par: 0 }
    loopMap.set(r, { count: previo.count + 1, par: previo.par + (h.par as number) })
  }

  const nombrados = Array.from(loopMap.entries()).filter(([nombre]) => nombre !== 'default')
  if (nombrados.length < 2) return []

  return ordenados(nombrados.map(([recorrido, d]) => ({ recorrido, holes: d.count, par: d.par })))
}

function ordenados(loops: CourseLoop[]): CourseLoop[] {
  return [...loops].sort((a, b) => a.recorrido.localeCompare(b.recorrido))
}
