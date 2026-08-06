// src/lib/data/tournaments/leaderboard.ts
//
// Capa de datos para la vista pública `/torneo/[slug]`. Centraliza todas
// las queries que antes vivían inline en page.tsx (917 LOC). Reglas:
// - SOLO acceso a datos: sin lógica de scoring, sin transformaciones de
//   reglas de golf. Eso vive en `src/golf/leaderboard/`.
// - Recibe el cliente Supabase ya creado por page.tsx (no lo importa el
//   módulo para mantenerlo trivialmente testeable en jsdom si hace falta).

import type {
  DBTournament,
  DBTournamentGroupRow,
  DBRondaLibreJugador,
  DBPlayer,
  DBWithdrawnPlayer,
  WithdrawnEntry,
} from '@/app/torneo/[slug]/types'
import type { CourseHole, LegacyHcpContext } from '@/golf/leaderboard/types'
import { COURSE_TEE_COLUMNS, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { createClient } from '@/utils/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolverCourseData,
  resolverCourseHandicap,
  resolverCourseHandicapDisplay,
  resolverHandicapDisplayDeRonda,
  type CourseData,
} from '@/golf/core/course-handicap'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'

/** Cliente Supabase server-side. Atado al createClient real para que el
 *  tipo coincida 1:1 con lo que devuelve `createClient()` en page.tsx.
 *  Exportado para que el gemelo de navegador (`tvBoard.ts`) pueda reusar los
 *  helpers de acá con un solo cast, en vez de duplicar la query. */
export type Client = Awaited<ReturnType<typeof createClient>>

const TOURNAMENT_SELECT =
  'id, name, slug, format, hole_count, total_rounds, modo_juego, formato_juego, ' +
  'date_start, date_end, status, codigo, afecta_estadisticas, es_demo, cover_image_url, ' +
  'courses(id, nombre, ciudad, par_total, slope_rating, course_rating)'

export async function fetchTournamentBySlug(
  supabase: Client,
  slug: string,
): Promise<DBTournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('slug', slug)
    .single()

  // "No existe" y "no pude preguntar" NO son lo mismo. El caller hace
  // notFound() sobre null, y un 404 no invita a reintentar — invita a cerrar la
  // app. Un blip de red durante un torneo en vivo NO puede convertirse en
  // "esta página no existe" (CERO FALLOS). PGRST116 = 0 filas → null legítimo
  // (inexistente, o invisible por RLS). Cualquier otro error se propaga para
  // que Next renderice error.tsx, que sí ofrece reintento.
  if (error && error.code !== 'PGRST116') throw error

  return (data as unknown as DBTournament | null) ?? null
}

export async function fetchCourseHoles(
  supabase: Client,
  courseId: string,
): Promise<CourseHole[]> {
  const { data } = await supabase
    .from('course_holes')
    .select('numero, par, stroke_index')
    .eq('course_id', courseId)
    // Orden explícito (igual que el scorer). Las canchas 27/36h traen varias filas
    // por nº de hoyo y los consumidores dedupean con criterios opuestos: el mapa de
    // pares se queda con la ÚLTIMA fila y `parDeLosHoyosJugados` con la PRIMERA. Sin
    // ORDER BY el orden lo decide Postgres, así que el par contra el que se puntúa y
    // el que entra a la fórmula del handicap podían salir de recorridos distintos.
    .order('numero')
  return (data as CourseHole[] | null) ?? []
}

// El viejo `buildFallbackCourseHoles` (cancha entera a par 4) lo reemplaza
// `hoyosDeLaVuelta` de `@/golf/courses/vueltas`, que además cubre el caso que
// ninguna de las copias cubría: una cancha de 9 hoyos en un torneo de 18 se
// recorre DOS VECES. Se importa de ahí en vez de re-exportarse con otro nombre:
// dos nombres para la misma función son dos conceptos aparentes.

/**
 * Par total deduplicado por nº de hoyo, para el cálculo de course handicap.
 * Espeja cómo el scorer arma `finalParTotal` (`pm[numero] = par`): si una cancha
 * multi-recorrido (27/36h) trae filas repetidas de `course_holes`, sumarlas todas
 * inflaría el par y desincronizaría el course handicap del board vs la tarjeta.
 */
export function sumParDedupByHole(holes: CourseHole[]): number {
  const parByHole = new Map<number, number>()
  for (const h of holes) parByHole.set(h.numero, h.par)
  return Array.from(parByHole.values()).reduce((s, p) => s + p, 0)
}

interface HcpContextRow {
  tees: string | null
  hcp_calc_mode: string | null
  courses: {
    par_total: number | null
    slope_rating: number | null
    course_rating: number | null
    course_tees: CourseTeeRow[] | null
  } | null
}

/**
 * FUENTE ÚNICA del contexto de course handicap del board público.
 *
 * Las tres pantallas del torneo (`/torneo`, `/tv`, `/en-vivo`) comparten motor
 * (`buildLeaderboardFromLegacy`) pero cada una arma sus propias queries. Si cada
 * una resolviera el tee/los ratings por su cuenta, volveríamos al problema que
 * este fix cierra: la misma pregunta ("¿con qué handicap se reparten los golpes
 * de este jugador?") contestada de N formas. Acá se contesta una vez.
 *
 * Una sola ida a la BD: el embed anidado trae los ratings de la cancha y su
 * catálogo de tees junto al torneo.
 *
 * "El torneo no tiene fila" y "no pude preguntar" NO son lo mismo — misma política
 * que `fetchTournamentBySlug`. Sin fila devuelve el contexto vacío (el board cae al
 * índice crudo, que es el comportamiento correcto de un torneo sin gate WHS). Un
 * ERROR se propaga: degradarlo a contexto vacío haría que el neto de una vuelta de
 * 9 hoyos salte al DOBLE de golpes y vuelva solo al siguiente refresh — el board
 * de un torneo en vivo parpadeando entre dos rankings es peor que una pantalla de
 * error con reintento.
 */
export async function fetchLegacyHcpContext(
  supabase: Client,
  tournamentId: string,
): Promise<LegacyHcpContext> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(
      'tees, hcp_calc_mode, ' +
        `courses(par_total, slope_rating, course_rating, course_tees(${COURSE_TEE_COLUMNS}))`,
    )
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { mode: null, tees: null, course: null, courseTees: [] }
  const row = data as unknown as HcpContextRow
  const c = row.courses

  return {
    mode: row.hcp_calc_mode,
    tees: row.tees,
    // `par_total` es lo único imprescindible: NO es un rating de fallback, es la
    // SEÑAL DE ESCALA del #289 (`esEscalaDe18Hoyos`) y la usa también la rama del
    // TEE, que corre aunque la cancha no tenga slope/CR propios. Si acá se
    // devolviera `null` por falta de un rating, el par de la cancha se perdería y
    // `computePlayerCourseHcp` caería al par de la RONDA (36) — justo el valor
    // ambiguo que #289 existe para no usar — dejando el CR del tee sin partir:
    // course handicap ~+36 y el board otra vez peleado con la tarjeta.
    //
    // Los ratings ausentes viajan como 0, que es falsy: `computePlayerCourseHcp`
    // ya trata eso como "esta cancha no tiene ratings" y no usa el fallback de
    // cancha — el mismo comportamiento que tiene hoy el scorer, que recibe esas
    // columnas en null.
    course:
      c?.par_total != null
        ? {
            par_total: c.par_total,
            slope_rating: c.slope_rating ?? 0,
            course_rating: c.course_rating ?? 0,
          }
        : null,
    courseTees: c?.course_tees ?? [],
  }
}

export async function fetchTournamentGroups(
  supabase: Client,
  tournamentId: string,
): Promise<DBTournamentGroupRow[]> {
  const { data } = await supabase
    .from('tournament_groups')
    .select('id, ronda_libre_id, name, tee_time, sort_order, tournament_group_players(player_id)')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  return (data as unknown as DBTournamentGroupRow[] | null) ?? []
}

export async function fetchRondaLibreJugadores(
  supabase: Client,
  rondaIds: string[],
): Promise<DBRondaLibreJugador[]> {
  if (rondaIds.length === 0) return []
  const { data } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, nombre, user_id, scores, handicap, tees, ronda_id')
    .in('ronda_id', rondaIds)
  return (data as unknown as DBRondaLibreJugador[] | null) ?? []
}

/**
 * Igual que `fetchRondaLibreJugadores` pero RESUELVE el `handicap` de cada jugador
 * de índice → COURSE HANDICAP por su tee, con los helpers canónicos
 * (`resolverCourseData` + `resolverCourseHandicap`) — los MISMOS que usa el scorer
 * en cancha (`getDotHcp` de score-grupo). Así el neto/stableford de la tabla pública
 * coincide EXACTO con la tarjeta del jugador en canchas reales (slope ≠ 113).
 *
 * Paridad con el scorer (y con `fetchBestBallTeams`, mismo patrón):
 *  - Resuelve por cada ronda su `course_id` / `holes` / `recorridos` (multi-loop
 *    27-36h) y el tee `j.tees || ronda.tees || 'azul'`.
 *  - Índice: `handicap` almacenado primero, luego `profiles.indice` (score-grupo:241).
 *  - `parTotal` = suma del par real de course_holes (lo pasa el caller), no la
 *    columna `courses.par_total`.
 *  - Cache de CourseData por `courseId|tee|holes`.
 *
 * El builder consume `j.handicap` tal cual, así que entregándolo ya como course
 * handicap el board queda correcto sin tocar el motor. Conserva `handicap_index`
 * (índice crudo) para el GWI. Sin cancha → `round(index)` (fallback del scorer).
 */
export async function fetchRondaLibreJugadoresConCourseHcp(
  supabase: Client,
  rondaIds: string[],
  parTotal: number,
): Promise<DBRondaLibreJugador[]> {
  const jugadores = await fetchRondaLibreJugadores(supabase, rondaIds)
  if (jugadores.length === 0) return jugadores

  // Datos por ronda (course_id / holes / recorridos / tee por defecto).
  const { data: rondas } = await supabase
    .from('rondas_libres')
    .select('id, course_id, holes, recorridos, tees')
    .in('id', rondaIds)
  const rondaById = new Map((rondas ?? []).map((r) => [r.id as string, r]))

  // Índice WHS vivo: fallback cuando el handicap almacenado en la ronda es null.
  const userIds = Array.from(new Set(jugadores.map((j) => j.user_id).filter((x): x is string => !!x)))
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, indice').in('id', userIds)
    : { data: [] as Array<{ id: string; indice: number | null }> }
  const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? 0]))

  const cache = new Map<string, CourseData | null>()
  const out: DBRondaLibreJugador[] = []
  for (const j of jugadores) {
    // Índice crudo: handicap almacenado primero, luego profiles.indice (= scorer).
    const index = j.handicap != null
      ? j.handicap
      : (j.user_id && indiceByUser.has(j.user_id) ? (indiceByUser.get(j.user_id) as number) : 0)

    const ronda = rondaById.get(j.ronda_id)
    const courseId = (ronda?.course_id as string | null) ?? null
    // Fuera del `if`: el camino seguro de `resolverCourseHandicap` necesita
    // saber si la vuelta es de 9 hoyos incluso cuando no hay cancha vinculada.
    const holesN = (ronda?.holes as number | null) ?? 18
    let courseData: CourseData | null = null
    // Sin cancha vinculada el número a mostrar es el índice entero, aunque la
    // vuelta sea de 9. Se deriva de la fuente única, no a mano.
    let handicapDisplay = resolverCourseHandicapDisplay(index, null, null)
    if (courseId) {
      const recorridos = (ronda?.recorridos as string[] | null) ?? null
      const tee = (j.tees || (ronda?.tees as string | null) || 'azul').toLowerCase()
      const key = `${courseId}|${tee}|${holesN}`
      if (!cache.has(key)) {
        cache.set(
          key,
          await resolverCourseData(supabase as unknown as SupabaseClient, courseId, tee, holesN, parTotal, recorridos),
        )
      }
      courseData = cache.get(key) ?? null

      // El HCP a MOSTRAR sale de la fuente única que usan las tres pantallas de
      // ronda libre. Acá corre server-side, así que se le inyecta el loader con
      // el cliente del request en vez del cliente browser.
      handicapDisplay = await resolverHandicapDisplayDeRonda(
        index,
        courseData,
        {
          courseId,
          tee,
          finalParTotal: parTotal,
          tieneRecorridos: !!recorridos?.length,
        },
        cache,
        (cid, t, holes, par) =>
          resolverCourseData(supabase as unknown as SupabaseClient, cid!, t, holes, par, null),
      )
    }
    out.push({
      ...j,
      handicap_index: index,
      handicap: resolverCourseHandicap(index, courseData, holesN),
      handicap_display: handicapDisplay,
    })
  }
  return out
}

/** Columnas de `players` que consume `buildLeaderboardFromLegacy`. Exportada
 *  porque el gemelo de navegador (`tvBoard.ts`) alimenta el MISMO motor: dos
 *  copias de esta lista significan que un día `/tv` reparte un handicap distinto
 *  que `/torneo` — exactamente el bug que este board vino a cerrar. */
export const LEGACY_PLAYER_SELECT =
  'id, handicap_at_registration, player_name, category_id, tee_id, ' +
  'profiles(name, indice), categories(name), ' +
  'rounds(id, status, total_gross, total_net, total_points, round_number, ' +
  'hole_scores(hole_number, gross_score))'

export async function fetchLegacyPlayers(
  supabase: Client,
  tournamentId: string,
): Promise<DBPlayer[]> {
  const { data } = await supabase
    .from('players')
    .select(LEGACY_PLAYER_SELECT)
    .eq('tournament_id', tournamentId)
    .in('status', ['pending', 'approved', 'waitlist'])
  return (data as unknown as DBPlayer[] | null) ?? []
}

/**
 * Jugadores en estado withdrawn/disqualified — aparecen en el footer del
 * leaderboard con badge WD/DQ (transparencia USGA: mantienen scores en BD
 * pero no compiten por posición).
 */
export async function fetchWithdrawnPlayers(
  supabase: Client,
  tournamentId: string,
): Promise<WithdrawnEntry[]> {
  const { data } = await supabase
    .from('players')
    .select('status, status_reason, player_name, profiles(name)')
    .eq('tournament_id', tournamentId)
    .in('status', ['withdrawn', 'disqualified'])

  const raw = (data as unknown as DBWithdrawnPlayer[] | null) ?? []
  const out: WithdrawnEntry[] = []
  for (const p of raw) {
    const displayName = p.profiles?.name ?? p.player_name
    if (displayName) {
      out.push({ name: displayName, status: p.status, reason: p.status_reason })
    }
  }
  return out
}
