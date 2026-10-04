// ─── Capa de datos — carga de una ronda libre para ANOTAR ───────────────────
//
// Lo que los dos scorers (`score/hooks/useRondaScoreData` y
// `score-grupo/hooks/useRondaGrupoData`) necesitan leer antes de mostrar el
// primer hoyo: la ronda con sus jugadores, el par / stroke index / yardaje de
// cada hoyo DE LA RONDA (no del catálogo) y el course handicap de cada jugador
// (el que puntúa y el que se muestra). Antes cada scorer tenía su copia de
// las tres cosas, y una sola de las copias contestaba bien en una cancha de
// 27 hoyos o en una vuelta de 9 sobre una cancha de 18.
//
// La vista en vivo (`ronda-libre.ts::loadRondaLibre`) sigue con su propia
// carga: necesita un SI normalizado y no yardajes, y trata distinto a los
// invitados sin índice. Unificarlas es un follow-up anotado en
// REORDENAMIENTO_TRACKING.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolverHandicapDisplayDeRonda,
  type CourseData,
} from '@/golf/core/course-handicap'
import { parTotalEstandar } from '@/golf/core/round-score'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { isTeamFormat } from '@/golf/formats'
import { teeDelJugador } from '@/golf/ronda-libre/tee-del-jugador'
import { getTeeYardageColumn } from '@/lib/ronda/helpers'
import { fetchHoyosDeLaRonda } from './course-holes'
import { conTimeout } from '@/lib/red/con-timeout'
import { fetchRondaEquipos, courseHandicapsDeRonda } from './ronda-libre'
import type { HoleData, RondaLibre } from '@/types/ronda'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

type Client = Pick<SupabaseClient, 'from'>

/** Columnas que necesitan los scorers. Fuente única del SELECT de los dos. */
export const COLUMNAS_RONDA_SCORER =
  'id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, admin_mode, admin_user_id, creador_id, hoyo_inicio, recorridos, es_demo, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)'

/** Plazo para leer la ronda: con la base saturada PostgREST tardaba 20-80 s (caída 04-oct-2026). */
export const PLAZO_CARGA_SCORER_MS = 10_000

/**
 * Resultado de leer la ronda para anotar. `no_existe` SÓLO cuando PostgREST
 * confirma que no hay fila (PGRST116); cualquier otra falla (timeout, 5xx, red)
 * es `sin_conexion` y el scorer NUNCA debe tratarla como "la ronda no existe".
 * Caída del 04-oct-2026: un timeout devolvía `null` y los dos scorers mandaban
 * al marcador al dashboard en plena ronda.
 */
/** Lo que ven los dos scorers mientras el servidor no responde (reintentan solos). */
export const MENSAJE_SCORER_SIN_CONEXION = 'Sin conexión con el servidor. Reintentando sola cada 15 segundos…'
/** Cada cuánto reintentan los scorers hablar con el servidor cuando no responde. */
export const REINTENTO_CARGA_MS = 15_000

export type CargaRondaScorer =
  | { estado: 'ok'; ronda: RondaLibre }
  | { estado: 'no_existe' }
  | { estado: 'sin_conexion' }

export async function fetchRondaLibreParaScorer(supabase: Client, codigo: string): Promise<CargaRondaScorer> {
  try {
    const { data, error } = await conTimeout(
      supabase
        .from('rondas_libres')
        .select(COLUMNAS_RONDA_SCORER)
        .eq('codigo', codigo)
        .single(),
      PLAZO_CARGA_SCORER_MS,
    )
    if (data) return { estado: 'ok', ronda: data as unknown as RondaLibre }
    if (error?.code === 'PGRST116') return { estado: 'no_existe' }
    return { estado: 'sin_conexion' }
  } catch {
    return { estado: 'sin_conexion' }
  }
}

export interface HoyosDelScorer {
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  /** Par total de la ronda (suma del catálogo; el estándar 36/72 si no hay dato). */
  finalParTotal: number
}

/** Par 4 / SI = número de hoyo / sin yardaje: lo que muestra el scorer sin catálogo. */
export function hoyosPorDefecto(holes: number): HoyosDelScorer {
  const parMap: Record<number, number> = {}
  const holeDataMap: Record<number, HoleData> = {}
  for (let i = 1; i <= holes; i++) {
    parMap[i] = 4
    holeDataMap[i] = { numero: i, par: 4, stroke_index: i, yardaje: null }
  }
  return { parMap, holeDataMap, finalParTotal: parTotalEstandar(holes) }
}

/**
 * Par, stroke index y yardajes de cada hoyo DE LA RONDA.
 *
 * Fuente única `fetchHoyosDeLaRonda`: ya viene en el orden en que se juegan
 * los recorridos elegidos y renumerada (en un complejo de 27 hoyos el par
 * cuelga de los recorridos hijos). Una cancha de 9 en una ronda de 18 se
 * recorre dos veces (`hoyosDeLaVuelta`): los hoyos 10-18 son los 1-9 otra
 * vez, y de qué hoyo del catálogo salió cada uno lo dice `origen` (así el
 * yardaje sale del hoyo correcto también en una cancha 27h). Sólo se exponen
 * yardajes auditados (`yardaje_verificado_at`). Sin catálogo → defaults.
 */
export async function cargarHoyosDelScorer(
  supabase: Client,
  ronda: Pick<RondaLibre, 'course_id' | 'recorridos' | 'holes' | 'tees'>,
): Promise<HoyosDelScorer> {
  const defaults = hoyosPorDefecto(ronda.holes)
  if (!ronda.course_id) return defaults

  const holes = await fetchHoyosDeLaRonda(supabase, ronda.course_id, ronda.recorridos as string[] | null)
  if (holes.length === 0) return defaults

  const teeCol = getTeeYardageColumn(teeDelJugador(null, ronda))
  const base = holes.map((h) => ({
    numero: h.numero,
    par: h.par,
    stroke_index: h.stroke_index as number,
    yardaje: (h as Record<string, unknown>).yardaje_verificado_at
      ? ((h as Record<string, unknown>)[teeCol] as number | null) ?? null
      : null,
    yardajes: (h as Record<string, unknown>).yardaje_verificado_at ? {
      negras: (h as Record<string, unknown>).yardaje_negras as number | null ?? null,
      azul: (h as Record<string, unknown>).yardaje_azul as number | null ?? null,
      blanco: (h as Record<string, unknown>).yardaje_blanco as number | null ?? null,
      rojo: (h as Record<string, unknown>).yardaje_rojo as number | null ?? null,
    } : undefined,
  }))
  const porNumero = new Map(base.map((h) => [h.numero, h]))
  const parMap: Record<number, number> = {}
  const holeDataMap: Record<number, HoleData> = {}
  hoyosDeLaVuelta(base, ronda.holes).forEach((h) => {
    const origen = h.origen != null ? porNumero.get(h.origen) ?? null : null
    parMap[h.numero] = h.par
    holeDataMap[h.numero] = {
      numero: h.numero,
      par: h.par,
      stroke_index: h.stroke_index,
      yardaje: origen?.yardaje ?? null,
      yardajes: origen?.yardajes,
    }
  })
  return { parMap, holeDataMap, finalParTotal: Object.values(parMap).reduce((a, b) => a + b, 0) }
}

export interface HandicapsDelScorer {
  /** Course handicap que PUNTÚA (en una vuelta de 9, la mitad — WHS). */
  hcpMap: Record<string, number>
  /** Course handicap que se MUESTRA: siempre en escala de 18 hoyos. */
  displayMap: Record<string, number>
}

/**
 * Índice → course handicap (WHS) con el tee de cada jugador. El índice sale
 * de la ronda si el jugador lo fijó; si no, del perfil; un invitado sin nada
 * juega con 0. Las lecturas de perfil y de cancha van en paralelo (sin N+1,
 * post-mortem 30-ago); la resolución del handicap a mostrar es secuencial
 * porque comparte un cache por tee entre awaits.
 */
export async function resolverHandicapsDelScorer(
  supabase: SupabaseClient,
  ronda: Pick<RondaLibre, 'course_id' | 'recorridos' | 'holes' | 'tees' | 'ronda_libre_jugadores'>,
  finalParTotal: number,
): Promise<HandicapsDelScorer> {
  // Índice y course handicap de scoring: fuente única `courseHandicapsDeRonda`
  // (la misma de la vista en vivo y del GWI). Antes el scorer tenía su propia copia.
  const { courseHcpMap, indexByJugador, courseDataByTee } = await courseHandicapsDeRonda(supabase, ronda, finalParTotal)
  const jugadoresConIndice = ronda.ronda_libre_jugadores.map(j => ({ ...j, index: indexByJugador[j.id], playerTee: teeDelJugador(j, ronda) }))

  const hcpMap: Record<string, number> = {}
  const displayMap: Record<string, number> = {}
  const courseDataFullByTee = new Map<string, CourseData | null>()
  for (const j of jugadoresConIndice) {
    const courseData9h = courseDataByTee[j.playerTee] ?? null
    hcpMap[j.id] = courseHcpMap[j.id]
    displayMap[j.id] = await resolverHandicapDisplayDeRonda(
      j.index,
      courseData9h,
      {
        courseId: ronda.course_id ?? null,
        tee: j.playerTee,
        finalParTotal,
        tieneRecorridos: !!(ronda.recorridos as string[] | null)?.length,
      },
      courseDataFullByTee,
    )
  }
  return { hcpMap, displayMap }
}

/** Equipo tal como lo anota el scorer de grupo: miembros en orden + sus nombres. */
export interface EquipoDelScorer extends Equipo {
  jugadorNombres: string[]
}

/**
 * Equipos de la ronda (sólo formatos por equipo; `[]` en el resto). Fuente
 * única `fetchRondaEquipos`; acá sólo se resuelven los nombres de los miembros.
 */
export async function fetchEquiposDelScorer(
  supabase: Client,
  ronda: Pick<RondaLibre, 'id' | 'formato_juego' | 'ronda_libre_jugadores'>,
): Promise<EquipoDelScorer[]> {
  if (!isTeamFormat(ronda.formato_juego)) return []
  const equipos = await fetchRondaEquipos(supabase, ronda.id)
  return equipos.map(e => ({
    ...e,
    jugadorNombres: e.jugadorIds.map(id => ronda.ronda_libre_jugadores.find(j => j.id === id)?.nombre || '?'),
  }))
}

/** Las tarjetas de la BD como estado del scorer (claves numéricas), por jugador. */
export function tarjetasDesdeLaRonda(ronda: Pick<RondaLibre, 'ronda_libre_jugadores'>): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {}
  for (const j of ronda.ronda_libre_jugadores) {
    const db: Record<number, number> = {}
    if (j.scores) for (const [k, v] of Object.entries(j.scores)) db[parseInt(k)] = v as number
    out[j.id] = db
  }
  return out
}
