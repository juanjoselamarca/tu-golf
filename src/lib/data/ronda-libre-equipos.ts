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
import type { HandicapsDeEquipo } from '@/golf/formats/team-handicap'
import type { HandicapOrigen } from '@/golf/ronda-libre/equipos-de-club'

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

/** Un equipo listo para grabar: nombre final, sus dos handicaps y las filas de jugador que lo forman (en orden). */
export interface EquipoAInsertar {
  nombre: string
  handicaps: HandicapsDeEquipo
  /** Ids de `ronda_libre_jugadores`, en el orden del equipo. Un equipo de club puede no tener ninguno. */
  jugadorIds: readonly string[]
  /** Solo equipos de club ('club'). Ausente = no se nombra la columna y queda su default ('calculado'). */
  handicapOrigen?: HandicapOrigen
  /**
   * Cuenta que anota este equipo desde su celular (un celular por equipo). Solo puede ser la sesión que inserta:
   * el trigger `ronda_equipos_anotador_guard` rechaza cualquier otra.
   */
  anotadorUserId?: string | null
  /** Drives del scramble (src/golf/formats/drives-scramble.ts): los jugadores del equipo. Ausente = sin drives. */
  driveJugadores?: readonly string[]
}

export type ResultadoInsertarEquipos = { ok: true } | { ok: false; error: unknown }

/**
 * Graba los equipos de una ronda libre recién creada y sus miembros, en orden.
 * Se corta en el primer equipo que no se graba y devuelve el error: una ronda por
 * equipos sin sus equipos no se entrega (antes un equipo fallido se saltaba en
 * silencio y el scorer quedaba sin a quién sumarle). Deshacer la ronda es de quien
 * llama, que es quien la creó.
 */
export async function insertarEquiposDeRonda(
  supabase: SupabaseClient,
  rondaId: string,
  equipos: readonly EquipoAInsertar[],
): Promise<ResultadoInsertarEquipos> {
  for (const equipo of equipos) {
    const { data: equipoDB, error: equipoErr } = await supabase
      .from('ronda_equipos')
      .insert({
        ronda_id: rondaId,
        nombre: equipo.nombre,
        // Ya redondeados (WHS): las dos columnas son smallint.
        handicap_equipo: equipo.handicaps.completo,
        handicap_equipo_juego: equipo.handicaps.juego,
        scores: {},
        // Las columnas nuevas solo se nombran cuando hacen falta: una ronda con jugadores no depende de ellas.
        ...(equipo.handicapOrigen ? { handicap_origen: equipo.handicapOrigen } : {}),
        ...(equipo.anotadorUserId ? { anotador_user_id: equipo.anotadorUserId } : {}),
        ...(equipo.driveJugadores ? { drive_jugadores: [...equipo.driveJugadores] } : {}),
      })
      .select('id')
      .single()
    if (equipoErr || !equipoDB) return { ok: false, error: equipoErr ?? new Error('insert de equipo sin fila') }

    // Un equipo de club sin jugadores no tiene miembros que grabar.
    if (equipo.jugadorIds.length === 0) continue
    const miembros = equipo.jugadorIds.map((jugadorId, orden) => ({ equipo_id: equipoDB.id, jugador_id: jugadorId, orden }))
    const { error: miembrosErr } = await supabase.from('ronda_equipo_jugadores').insert(miembros)
    if (miembrosErr) return { ok: false, error: miembrosErr }
  }
  return { ok: true }
}
