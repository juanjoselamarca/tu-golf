// ─── Capa de datos para /perfil/historial ─────────────────────────────────────
//
// Server-side (RSC + route handler). La página ya NO hace supabase.from()
// client-side para la carga inicial ni fetch('/api/historial/stats') tras
// hidratar: ambos viven acá y el Server Component los resuelve en paralelo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import {
  computeHistorialStats,
  type CourseHoleRow,
  type HistorialStats,
  type RawStatsRound,
} from '@/golf/stats/historial'
import { findBestCourseMatch, type CourseCandidate } from '@/golf/courses/matching'

/**
 * Fila de historical_rounds tal como la consume la lista del historial.
 * Canónica ACÁ (capa de datos, igual que StatsRound en lib/data/stats.ts);
 * src/app/perfil/historial/lib/types.ts la re-exporta para los componentes.
 */
export interface HistoricalRound {
  id:           string
  course_name:  string
  course_id?:   string | null
  tee_color:    string | null
  played_at:    string
  scores:       (number | null)[]
  total_gross:  number | null
  holes_played: number | null
  notes:        string | null
  privacy:      string
  created_at:   string
  formato_juego?: string
  modo_juego?:    string
  par_per_hole?:  Record<string, number> | null
  /** Si true, la ronda NO entra al cálculo del índice Golfers+ (inbox e21e2a32 parte B). */
  excluded_from_handicap?: boolean
  /** Diferencial WHS pre-calculado en BD — usado por modal "¿Qué rondas cuentan?" (inbox 82af3d48). */
  diferencial?: number | null
  /** Slope rating del tee jugado — necesario para calcular diferencial y elegibilidad de índice. */
  slope_rating?: number | null
  /** Course rating del tee jugado — necesario para calcular diferencial y elegibilidad de índice. */
  course_rating?: number | null
}

/**
 * Fuente ÚNICA de las columnas que consume la lista del historial.
 * La importa también el hook client-side que re-fetchea tras mutaciones
 * (useHistorialRounds.reload) — evita que dos copias se desincronicen.
 */
export const SELECT_COLUMNS =
  'id, course_name, course_id, tee_color, played_at, scores, total_gross, holes_played, notes, privacy, created_at, formato_juego, modo_juego, par_per_hole, excluded_from_handicap, diferencial, slope_rating, course_rating'

// D8: las tarjetas FedeGolf no se muestran en el listado genérico ni cuentan en
// las stats del historial (su hogar es el modal "Índice oficial explicado").
// Filtro canónico compartido con el resto de lecturas genéricas (coach, stats,
// CPI, dashboard) — definido una sola vez en historical-rounds-filters.
export { OR_EXCLUDE_FEDEGOLF } from './historical-rounds-filters'
import { OR_EXCLUDE_FEDEGOLF } from './historical-rounds-filters'

export interface HistorialRoundsResult {
  rounds: HistoricalRound[]
  /** true si la query falló — la UI muestra FatalErrorScreen con Reintentar (paridad con el flujo client previo). */
  loadError: boolean
}

/**
 * Rondas históricas del usuario para la lista, descendentes por fecha.
 * El `.eq('user_id')` es explícito además de la RLS own_rounds (defensa en
 * profundidad — mismo resultado, intención legible).
 *
 * No lanza: si falla se loguea y la UI pinta el estado de error con retry
 * (el retry client-side usa reload() del hook, igual que antes del refactor).
 */
export async function fetchHistorialRounds(
  supabase: SupabaseClient,
  userId: string,
): Promise<HistorialRoundsResult> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF)
    .order('played_at', { ascending: false })
    .limit(500)

  if (error) {
    await captureError(error, { context: 'fetchHistorialRounds', userId })
    return { rounds: [], loadError: true }
  }
  return { rounds: (data as unknown as HistoricalRound[]) ?? [], loadError: false }
}

/**
 * Stats agregadas del historial (pills del header, PR grid, conteos
 * eagles/birdies/pares/bogeys/dobles+).
 *
 * Queries idénticas al route /api/historial/stats original — en particular el
 * fix del bug inbox 2268163d / PR #254: course_holes se pagina ordenando por
 * (course_id, numero) — clave ÚNICA — porque con `.order('numero')` a secas
 * cientos de canchas comparten cada valor de numero y Postgres NO ordena de
 * forma estable entre requests `.range()` separados → filas dropeadas al
 * cruzar páginas → eagles/pares mal contados. NO cambiar este orden.
 *
 * Devuelve null si falla (rondas o hoyos): la página cae al cálculo local
 * (paridad con el fetch client no-bloqueante previo) y el route responde 500.
 */
export async function fetchHistorialStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<HistorialStats | null> {
  // Fetch rounds + courses in parallel. course_holes se pagina (Supabase limita a
  // 1000 rows por request) — sin paginar, canchas con id alto quedaban fuera del
  // map y la query reportaba "0 birdies" aunque hubiera muchas rondas matcheadas.
  // Ver bug P12 (auditoría 22-abr-2026).
  const PAGE_SIZE = 1000
  const [roundsRes, coursesRes] = await Promise.all([
    supabase
      .from('historical_rounds')
      .select('id, course_name, course_id, played_at, scores, total_gross, holes_played, import_source, garmin_scorecard_id, metadata')
      .eq('user_id', userId)
      .or(OR_EXCLUDE_FEDEGOLF)
      .order('played_at', { ascending: false }),
    supabase
      .from('courses')
      .select('id, nombre, fuente, canonical_course_id'),
  ])

  const rawRounds = (roundsRes.data ?? []) as unknown as RawStatsRound[]
  // Paridad con el route original: un error en courses NO es fatal — el
  // matching por nombre simplemente no encuentra candidatos.
  const allCourses = (coursesRes.data ?? []) as CourseCandidate[]

  // Solo se necesitan los hoyos de las canchas que las rondas del usuario
  // matchean: por course_id directo, o por nombre vía el MISMO matcher que usa
  // computeHistorialStats (findCourseId → findBestCourseMatch, que ya resuelve
  // canonical). El set resultante es un SUPERSET exacto de lo que ese matcher
  // puede devolver → paridad de stats garantizada, pero evita paginar las ~3200
  // filas de course_holes de TODAS las canchas del catálogo en cada carga.
  const neededCourseIds = new Set<string>()
  const nameMatch = new Map<string, string | null>()
  for (const r of rawRounds) {
    if (r.course_id) neededCourseIds.add(r.course_id)
    const name = r.course_name
    if (name) {
      if (!nameMatch.has(name)) nameMatch.set(name, findBestCourseMatch(name, allCourses)?.id ?? null)
      const mid = nameMatch.get(name)
      if (mid) neededCourseIds.add(mid)
    }
  }

  // Paginar course_holes (acotado a las canchas del usuario) con orden
  // determinista (course_id, numero) — fix #254. Sin canchas → sin query.
  const allHoles: CourseHoleRow[] = []
  let holesError: unknown = null
  if (neededCourseIds.size > 0) {
    const ids = Array.from(neededCourseIds)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('course_holes')
        .select('course_id, numero, par')
        .in('course_id', ids)
        .order('course_id')
        .order('numero')
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) { holesError = error; break }
      if (!data || data.length === 0) break
      allHoles.push(...(data as CourseHoleRow[]))
      if (data.length < PAGE_SIZE) break
    }
  }

  if (roundsRes.error || holesError) {
    await captureError(roundsRes.error ?? holesError, { context: 'fetchHistorialStats', userId })
    return null
  }

  return computeHistorialStats(rawRounds, allCourses, allHoles)
}
