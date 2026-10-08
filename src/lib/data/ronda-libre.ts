// ─── Capa de datos — vista live de ronda-libre ([codigo]/page.tsx) ──────────
// Extraída del componente monolítico (job "Resultados v2"). Encapsula TODO el
// acceso a Supabase de la vista pública: lectura de la ronda + cancha + equipos,
// y el guardado de score del admin vía RPC.
//
// Behavior-preserving respecto del antiguo `fetchRonda` inline, con UNA mejora
// result-equivalent: el índice de los jugadores se resuelve con un único query
// batch `.in('id', userIds)` en vez de un query por jugador (eliminación de N+1).

import { createClient } from '@/lib/supabase'
import { parTotalEstandar } from '@/golf/core/round-score'
import { resolverCourseHandicap, resolverHandicapDisplayDeRonda, resolverCourseData, type CourseData } from '@/golf/core/course-handicap'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { fetchHoyosDeLaRonda } from './course-holes'
import type { CourseHole, RondaLibre } from '@/types/ronda'
import type { Equipo, LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'
import { isTeamFormat } from '@/golf/formats'
import type { SupabaseClient } from '@supabase/supabase-js'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'

/**
 * Equipos de una ronda libre (ronda_equipos + sus jugadores en orden). Fuente
 * única: la vista en vivo, el push a seguidores y cualquier board de equipos
 * leen de acá — nunca una segunda query a ronda_equipos.
 */
export async function fetchRondaEquipos(
  supabase: Pick<SupabaseClient, 'from'>,
  rondaId: string,
): Promise<Equipo[]> {
  const { data: eqData } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_id, ronda_equipo_jugadores(jugador_id, orden)')
    .eq('ronda_id', rondaId)
    .order('created_at')
  return (eqData ?? []).map(e => ({
    id: e.id as string,
    nombre: e.nombre as string,
    handicap_equipo: e.handicap_equipo as number | null,
    scores: (e.scores as Record<string, number>) || {},
    jugadorIds: ((e.ronda_equipo_jugadores || []) as Array<{ jugador_id: string; orden: number }>)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map(m => m.jugador_id),
  }))
}

/**
 * Carga la ronda por código + todos los datos derivados (par/SI por hoyo,
 * course handicap por jugador, equipos si la modalidad es por equipos).
 *
 * Devuelve un discriminated union que distingue 404 real de error transitorio,
 * para que la UI conserve la data previa ante caídas de red (CERO FALLOS).
 */
type RondaParaHandicap = Pick<RondaLibre, 'course_id' | 'tees' | 'holes' | 'recorridos'> & {
  ronda_libre_jugadores: Array<{ id: string; user_id?: string | null; handicap?: number | null; tees?: string | null }>
}

/**
 * Índice y course handicap de SCORING de cada jugador de una ronda libre (WHS,
 * tee por jugador; 9 hoyos → índice/2 con ratings de 9). FUENTE ÚNICA: la usan la
 * vista en vivo (`loadRondaLibre`, cliente browser) y el GWI (`/api/gwi/ronda-libre`,
 * cliente del request). Antes el GWI repartía golpes con el ÍNDICE crudo, sin
 * slope ni mitad de 9 hoyos.
 *
 * Índice: `handicap` de la tarjeta; si falta y hay cuenta, `profiles.indice`; si
 * no hay índice declarado, 0 (juega sin golpes de ventaja: no se inventan 18).
 * Decisión 01-oct-2026 al unificar con el scorer, que ya usaba 0; en prod los 80
 * invitados sin índice juegan en modo gross, donde no cambia nada.
 * `parDeLaCancha` es el par de la CANCHA (no el de la ronda): escala del rating.
 *
 * `cacheCourseData` (opcional): memo de `resolverCourseData` compartido entre
 * varias rondas de un mismo request (el feed público `/api/en-vivo` resuelve
 * muchas rondas en la misma cancha). Sin él, conducta idéntica a la de siempre.
 */
export async function courseHandicapsDeRonda(
  supabase: SupabaseClient,
  ronda: RondaParaHandicap,
  parDeLaCancha: number,
  cacheCourseData?: Map<string, Promise<CourseData | null>>,
): Promise<{
  courseHcpMap: Record<string, number>
  indexByJugador: Record<string, number>
  /** Jugadores sin índice declarado (ni en la tarjeta ni en el perfil): juegan con 0, pero WHS 3.1b los topa en par + 5. */
  sinIndice: Set<string>
  courseDataByTee: Record<string, CourseData | null>
}> {
  const idsNeedingIndex = ronda.ronda_libre_jugadores
    .filter(j => j.handicap == null && j.user_id)
    .map(j => j.user_id as string)
  const indexByUserId: Record<string, number> = {}
  if (idsNeedingIndex.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, indice')
      .in('id', idsNeedingIndex)
    for (const p of (profiles ?? []) as Array<{ id: string; indice: number | null }>) {
      if (p.indice != null) indexByUserId[p.id] = p.indice
    }
  }

  // Course data de cada tee único EN PARALELO (damas/varones = 2 cadenas de hasta 3
  // queries; en serie alargaban la carga en frío del scorer).
  const tees = Array.from(new Set(ronda.ronda_libre_jugadores.map(j => teeDelJugador(j, ronda))))
  const recorridos = (ronda.recorridos as string[] | null) ?? null
  const courseDataDe = (courseId: string, tee: string): Promise<CourseData | null> => {
    const cargar = () => resolverCourseData(supabase, courseId, tee, ronda.holes, parDeLaCancha, recorridos)
    if (!cacheCourseData) return cargar()
    // La clave lleva TODO lo que entra a `resolverCourseData`: misma clave = misma respuesta.
    const clave = `${courseId}|${tee}|${ronda.holes}|${parDeLaCancha}|${(recorridos ?? []).join(',')}`
    let p = cacheCourseData.get(clave)
    if (!p) {
      p = cargar()
      cacheCourseData.set(clave, p)
    }
    return p
  }
  const datos = await Promise.all(tees.map(tee => ronda.course_id
    ? courseDataDe(ronda.course_id, tee)
    : Promise.resolve(null)))
  const courseDataByTee: Record<string, CourseData | null> = Object.fromEntries(tees.map((t, i) => [t, datos[i]]))

  const courseHcpMap: Record<string, number> = {}
  const indexByJugador: Record<string, number> = {}
  const sinIndice = new Set<string>()
  for (const j of ronda.ronda_libre_jugadores) {
    const declarado = j.handicap != null ? j.handicap : j.user_id ? indexByUserId[j.user_id] : undefined
    if (declarado == null) sinIndice.add(j.id)
    const index = declarado ?? 0
    indexByJugador[j.id] = index
    courseHcpMap[j.id] = resolverCourseHandicap(index, courseDataByTee[teeDelJugador(j, ronda)], ronda.holes)
  }
  return { courseHcpMap, indexByJugador, sinIndice, courseDataByTee }
}

export async function loadRondaLibre(codigo: string): Promise<LoadRondaResult> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('rondas_libres')
      .select('id, codigo, course_name, course_id, tees, holes, hoyo_inicio, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, creador_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
      .eq('codigo', codigo)
      .single()

    if (!data) {
      // 404 real → not_found. Errores transitorios (red/auth) → reintentar.
      if (error?.code === 'PGRST116' || (!error && !data)) {
        return { status: 'not_found' }
      }
      return { status: 'transient' }
    }

    const ronda = data as unknown as RondaLibre
    let finalParTotal = parTotalEstandar(ronda.holes)
    const parMap: Record<number, number> = {}
    let siMap: Record<number, number> = {}

    // Par / stroke-index por hoyo (solo si la ronda está ligada a una cancha).
    if (ronda.course_id) {
      // Fuente única: ya viene ordenada por la selección de recorridos y
      // renumerada. La query inline que había acá miraba sólo `course_id` de la
      // ronda y devolvía 0 filas en los complejos de 27 hoyos, donde el par
      // cuelga de los recorridos hijos.
      const holes = await fetchHoyosDeLaRonda(
        supabase,
        ronda.course_id,
        ronda.recorridos as string[] | null,
        'numero, par, stroke_index, recorrido',
      )
      if (holes.length > 0) {
        // Los hoyos de la RONDA, no los del catálogo: una cancha de 9 hoyos en
        // una ronda de 18 se recorre dos veces y los hoyos 10-18 son los 1-9
        // otra vez (`@/golf/courses/vueltas`). Tiene que contestar LO MISMO que
        // el scorer: si esta capa dijera par 35 y el scorer 70, el board y la
        // tarjeta del jugador mostrarían netos distintos para la misma ronda.
        const base = (holes as unknown as CourseHole[]).map((h) => ({
          numero: h.numero,
          par: h.par,
          stroke_index: h.stroke_index,
        }))
        for (const h of hoyosDeLaVuelta(base, ronda.holes)) {
          parMap[h.numero] = h.par
          siMap[h.numero] = h.stroke_index
        }
        finalParTotal = Object.values(parMap).reduce((a, b) => a + b, 0)
      }
    }

    // Normaliza el stroke index a permutación válida 1..N en la FUENTE (un concepto,
    // una fuente): TODOS los consumidores del siMap —leaderboard, tarjeta de
    // compartir, match play, notificaciones y el detalle hoyo-a-hoyo— reparten los
    // golpes de hándicap sobre el MISMO SI. Sin esto, un SI corrupto de catálogo, o
    // el SI 1..18 de una cancha de 18h jugada como loop de 9h (front-9 con SI>9 en
    // 166 canchas), haría que el leaderboard (que normaliza) y la tarjeta de
    // compartir (que no) mostraran netos distintos para la MISMA ronda. Idempotente
    // sobre un SI ya válido. Bug de campo "net +12 Don Jorge" (inbox e6408e3c).
    if (Object.keys(siMap).length > 0) {
      siMap = normalizeStrokeIndexMap(siMap, ronda.holes)
    }

    // Course handicap de SCORING por jugador: fuente única `courseHandicapsDeRonda`
    // (la usa también el GWI server-side, con el cliente del request).
    const { courseHcpMap, indexByJugador, sinIndice, courseDataByTee } =
      await courseHandicapsDeRonda(supabase, ronda, finalParTotal)

    // Display (columna HCP): el COMPLETO de 18h, para que una ronda de 9h no muestre
    // la mitad y pierda significado (un concepto, una fuente — `course-handicap.ts`).
    const courseDataFullByTee = new Map<string, CourseData | null>()
    const displayHcpMap: Record<string, number> = {}
    for (const j of ronda.ronda_libre_jugadores) {
      const index = indexByJugador[j.id]
      const playerTee = teeDelJugador(j, ronda)
      const courseData9h = courseDataByTee[playerTee] ?? null

      // Display: en rondas de 9h cargamos los ratings de 18h del MISMO tee y
      // resolvemos el course handicap completo. `finalParTotal` ES el par de 18h
      // SÓLO cuando la ronda NO tiene recorridos (la query de course_holes trae
      // los 18 hoyos). En una cancha multi-recorrido jugada como un loop de 9h,
      // `finalParTotal` es el par del loop (~36) y no podemos derivar el de 18h de
      // forma confiable → mostramos round(index) (handicap completo aprox), nunca
      // un valor inflado. Cacheado por tee.
      displayHcpMap[j.id] = await resolverHandicapDisplayDeRonda(
        index,
        courseData9h,
        {
          courseId: ronda.course_id,
          tee: playerTee,
          finalParTotal,
          tieneRecorridos: !!(ronda.recorridos as string[] | null)?.length,
        },
        courseDataFullByTee,
      )
    }

    // Equipos (solo modalidades por equipo).
    const equipos: Equipo[] = isTeamFormat(ronda.formato_juego)
      ? await fetchRondaEquipos(supabase, ronda.id)
      : []

    return { status: 'ok', ronda, parMap, siMap, courseHcpMap, displayHcpMap, sinIndice: [...sinIndice], equipos }
  } catch {
    return { status: 'error' }
  }
}
