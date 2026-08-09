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
import { resolverCourseHandicap, resolverHandicapDisplayDeRonda, cargarCourseData, type CourseData } from '@/golf/core/course-handicap'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { fetchHoyosDeLaRonda } from './course-holes'
import type { CourseHole, RondaLibre } from '@/types/ronda'
import type { Equipo, LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'
import { isTeamFormat } from '@/golf/formats'

/**
 * Carga la ronda por código + todos los datos derivados (par/SI por hoyo,
 * course handicap por jugador, equipos si la modalidad es por equipos).
 *
 * Devuelve un discriminated union que distingue 404 real de error transitorio,
 * para que la UI conserve la data previa ante caídas de red (CERO FALLOS).
 */
export async function loadRondaLibre(codigo: string): Promise<LoadRondaResult> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('rondas_libres')
      .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, creador_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
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

    // Índice → course handicap (WHS, tee por jugador).
    // Batch: un solo query de profiles para todos los user_id sin handicap explícito.
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
        indexByUserId[p.id] = p.indice ?? 0
      }
    }

    // Dos handicaps por jugador (un concepto, una fuente — `course-handicap.ts`):
    //  - courseHcpMap   → el de SCORING (9h en rondas de 9h: reparte strokes).
    //  - displayHcpMap  → el COMPLETO (18h) que se MUESTRA en la columna HCP, para
    //    que una ronda de 9h no muestre la mitad y pierda significado.
    const courseDataByTee: Record<string, Awaited<ReturnType<typeof cargarCourseData>>> = {}
    const courseDataFullByTee = new Map<string, CourseData | null>()
    const courseHcpMap: Record<string, number> = {}
    const displayHcpMap: Record<string, number> = {}
    for (const j of ronda.ronda_libre_jugadores) {
      let index: number
      if (j.handicap != null) {
        index = j.handicap
      } else if (j.user_id) {
        index = indexByUserId[j.user_id] ?? 0
      } else {
        index = 18
      }
      const playerTee = (j.tees || ronda.tees || 'azul').toLowerCase()
      if (!courseDataByTee[playerTee]) {
        courseDataByTee[playerTee] = await cargarCourseData(
          ronda.course_id,
          playerTee,
          ronda.holes,
          finalParTotal,
          (ronda.recorridos as string[] | null) ?? null,
        )
      }
      const courseData9h = courseDataByTee[playerTee]
      courseHcpMap[j.id] = resolverCourseHandicap(index, courseData9h, ronda.holes)

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
    let equipos: Equipo[] = []
    if (isTeamFormat(ronda.formato_juego)) {
      const { data: eqData } = await supabase
        .from('ronda_equipos')
        .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id, orden)')
        .eq('ronda_id', ronda.id)
        .order('created_at')
      if (eqData) {
        equipos = eqData.map(e => ({
          id: e.id,
          nombre: e.nombre,
          handicap_equipo: e.handicap_equipo,
          scores: (e.scores as Record<string, number>) || {},
          jugadorIds: ((e.ronda_equipo_jugadores || []) as Array<{ jugador_id: string; orden: number }>)
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map(m => m.jugador_id),
        }))
      }
    }

    return { status: 'ok', ronda, parMap, siMap, courseHcpMap, displayHcpMap, equipos }
  } catch {
    return { status: 'error' }
  }
}
