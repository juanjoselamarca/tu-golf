// src/lib/data/ronda-libre-equipos.ts
//
// Handicap de equipo de una ronda libre NUEVA (POST /api/ronda-libre/create),
// espejo del productor de torneos (`handicapsDeEquipoDelGrupo`, teamRounds.ts).
// Antes vivía en la ruta y calculaba el % de equipo sobre los ÍNDICES; ahora sale
// de la fuente canónica (`handicapDeEquipo`, src/golf/formats/team-handicap.ts)
// sobre el course handicap SIN redondear de cada jugador con su tee: el mismo
// course handicap con que el scorer le reparte golpes a ese jugador
// (`courseHandicapsDeRonda`: `resolverCourseData` por tee + par de la ronda).
// La ronda libre no tiene personalizado: siempre la asignación oficial.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedBallFormat } from '@/golf/formats'
import { handicapDeEquipo } from '@/golf/formats/team-handicap'
import { resolverCourseData, resolverCourseHandicapSinRedondear, type CourseData } from '@/golf/core/course-handicap'
import { fetchHoyosDeLaRonda } from './course-holes'
import { parYSiDeLaRonda, type HoyoDeCatalogoEnVivo } from './ronda-libre'
import type { HandicapsDeEquipo } from './tournaments/teamRounds'

export type { HandicapsDeEquipo }

/** Un jugador de un equipo, tal como llega en el body de la ronda nueva. */
export interface MiembroDeEquipoNuevo {
  /** Índice declarado en la tarjeta. Sin índice → 0 (misma regla que el scorer con un invitado). */
  indice: number | null
  /** Tee del jugador (el suyo o el de la ronda). */
  tee: string
}

export interface RondaNuevaParaEquipos {
  formato: string
  courseId: string | null
  holes: number
  recorridos: string[] | null
}

const SIN_HANDICAP: HandicapsDeEquipo = { completo: null, juego: null }

/**
 * Los dos handicaps de cada equipo (mismo orden que `equipos`):
 * - `juego` (`handicap_equipo_juego`): sobre el course handicap de los hoyos de
 *   la ronda (en 9 hoyos, ratings de 9: WHS 6.1b). Es el que reparte golpes.
 * - `completo` (`handicap_equipo`): sobre el de 18 hoyos, el que se muestra. En
 *   rondas de 18 o más es el mismo número.
 * Best ball y formatos individuales → ambos null (sin consultas).
 *
 * Lecturas: el catálogo de hoyos una vez y `resolverCourseData` una vez por
 * tee y escala. Las mismas funciones que el scorer: si la base falla, caen a lo
 * mismo que él (el índice como course handicap), así el equipo y la tarjeta no
 * se separan.
 */
export async function handicapsDeEquipoDeRondaNueva(
  supabase: SupabaseClient,
  ronda: RondaNuevaParaEquipos,
  equipos: readonly (readonly MiembroDeEquipoNuevo[])[],
): Promise<HandicapsDeEquipo[]> {
  if (!isSharedBallFormat(ronda.formato)) return equipos.map(() => SIN_HANDICAP)

  // Mismo catálogo y mismo par que la vista en vivo y el scorer (`parYSiDeLaRonda`).
  const catalogo = ronda.courseId
    ? ((await fetchHoyosDeLaRonda(supabase, ronda.courseId, ronda.recorridos, 'numero, par, stroke_index, recorrido')) as unknown as HoyoDeCatalogoEnVivo[])
    : []
  const parDe = (hoyos: number) => parYSiDeLaRonda(catalogo, hoyos).parTotal

  const cache = new Map<string, Promise<CourseData | null>>()
  const courseData = (tee: string, hoyos: number): Promise<CourseData | null> => {
    const clave = `${tee}|${hoyos}`
    if (!cache.has(clave)) {
      cache.set(
        clave,
        ronda.courseId
          ? resolverCourseData(supabase, ronda.courseId, tee, hoyos, parDe(hoyos), ronda.recorridos)
          : Promise.resolve(null),
      )
    }
    return cache.get(clave)!
  }

  const equipoEn = async (miembros: readonly MiembroDeEquipoNuevo[], hoyos: number): Promise<number | null> => {
    const ch = await Promise.all(
      miembros.map(async (m) => resolverCourseHandicapSinRedondear(m.indice ?? 0, await courseData(m.tee, hoyos), hoyos)),
    )
    return handicapDeEquipo(ronda.formato, ch, { modo: 'oficial' })
  }

  return Promise.all(
    equipos.map(async (miembros) => {
      const juego = await equipoEn(miembros, ronda.holes)
      if (juego == null) return SIN_HANDICAP
      const completo = ronda.holes >= 18 ? juego : await equipoEn(miembros, 18)
      return { completo, juego }
    }),
  )
}
