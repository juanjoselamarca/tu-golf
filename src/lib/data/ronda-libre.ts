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
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import type { CourseHole, RondaLibre } from '@/types/ronda'
import type { Equipo, LoadRondaResult } from '@/app/ronda-libre/[codigo]/types'

const TEAM_FORMATS = ['best_ball', 'scramble', 'foursome']

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
    const siMap: Record<number, number> = {}

    // Par / stroke-index por hoyo (solo si la ronda está ligada a una cancha).
    if (ronda.course_id) {
      let holeQuery = supabase
        .from('course_holes')
        .select('numero, par, stroke_index, recorrido')
        .eq('course_id', ronda.course_id)
      const recorridos = ronda.recorridos as string[] | null
      if (recorridos && recorridos.length > 0) {
        holeQuery = holeQuery.in('recorrido', recorridos)
      }
      const { data: holes } = await holeQuery.order('recorrido').order('numero')
      if (holes) {
        const isMultiLoop = !!recorridos && recorridos.length > 1
        let holeNum = 1
        ;(holes as CourseHole[]).forEach(h => {
          const num = isMultiLoop ? holeNum : h.numero
          parMap[num] = h.par
          siMap[num] = h.stroke_index
          holeNum++
        })
        finalParTotal = Object.values(parMap).reduce((a, b) => a + b, 0)
      }
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

    const courseDataByTee: Record<string, Awaited<ReturnType<typeof cargarCourseData>>> = {}
    const courseHcpMap: Record<string, number> = {}
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
      courseHcpMap[j.id] = resolverCourseHandicap(index, courseDataByTee[playerTee])
    }

    // Equipos (solo modalidades por equipo).
    let equipos: Equipo[] = []
    if (TEAM_FORMATS.includes(ronda.formato_juego)) {
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

    return { status: 'ok', ronda, parMap, siMap, courseHcpMap, equipos }
  } catch {
    return { status: 'error' }
  }
}
