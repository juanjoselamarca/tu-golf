/**
 * Capa de datos: rondas del jugador para el coach (fuente ÚNICA).
 *
 * `historical_rounds` es la fuente unificada: las rondas jugadas en-vivo se
 * insertan ahí al finalizar (useFinalizeRonda) y las importadas setean
 * `import_source`. Por eso NO se unen tablas (eso doble-contaría las en-vivo).
 * `source` se deriva de `import_source IS NULL`.
 *
 * Resuelve el P0 de campo (inbox 2026-06-09): el coach no tenía forma de
 * "dame mis rondas en tal cancha" — solo `get_round_by_date` por fecha EXACTA.
 * Acá se busca por cancha (nombre o UUID), rango de fechas, hole-count y orden.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { inferHoles } from '@/golf/core/holes'
import { matchCourseInDB } from '@/golf/courses/matching'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CoachRoundFilters = {
  /** Nombre de la cancha (se resuelve) o su UUID. */
  course?: string | null
  /** Fecha desde (YYYY-MM-DD, inclusive). */
  desde?: string | null
  /** Fecha hasta (YYYY-MM-DD, inclusive). */
  hasta?: string | null
  /** Filtra por hole-count inferido (9 o 18). */
  holes?: number | null
  /** Máximo de rondas a devolver (default 10, tope 30). */
  limit?: number
  /** Orden del resultado. */
  orden?: 'reciente' | 'antigua' | 'mejor' | 'peor'
}

export type CoachRound = {
  id: string
  source: 'en_vivo' | 'importada'
  fecha: string | null
  course_id: string | null
  cancha: string | null
  total_gross: number | null
  holes_played: number | null
}

export type FindRoundsResult = {
  count: number
  rounds: CoachRound[]
  /** Cancha resuelta desde el nombre, si aplica. */
  resolved_course: { nombre: string; course_id: string } | null
  /** Nota para el coach (ej: cancha no catalogada → buscamos por texto del nombre). */
  note?: string
}

type Row = {
  id: string
  course_id: string | null
  course_name: string | null
  played_at: string | null
  total_gross: number | null
  holes_played: number | null
  scores: number[] | Record<string, number> | null
  import_source: string | null
}

/** Quita marcas diacríticas combinantes (U+0300–U+036F) sin usar regex con flag
 *  unicode (el target de TS del proyecto no lo permite). */
function stripDiacritics(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x300 && code <= 0x36f) continue
    out += ch
  }
  return out
}

function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase().trim()
}

/**
 * Busca rondas del jugador con filtros flexibles. Lee SOLO `historical_rounds`
 * (fuente única). El filtrado por cancha/holes/orden se hace en memoria sobre
 * el set del jugador (≤ cientos de rondas) para ser robusto ante variantes de
 * course_id / nombre — más fiable que un `.eq` que se pierde rondas con id null.
 */
export async function findRoundsForCoach(
  supabase: SupabaseClient,
  userId: string,
  filters: CoachRoundFilters = {},
): Promise<FindRoundsResult> {
  // 1. Resolver cancha (nombre → course_id canónico) si vino una ref no-UUID.
  let resolvedCourseId: string | null = null
  let resolvedCourse: { nombre: string; course_id: string } | null = null
  let note: string | undefined
  const courseRef = filters.course?.trim() || null
  if (courseRef) {
    if (UUID_RE.test(courseRef)) {
      resolvedCourseId = courseRef
    } else {
      const match = await matchCourseInDB(courseRef, supabase)
      if (match) {
        resolvedCourseId = match.id
        resolvedCourse = { nombre: match.nombre, course_id: match.id }
      } else {
        note = `La cancha "${courseRef}" no está en el catálogo; busqué por el texto del nombre en tus rondas.`
      }
    }
  }

  // 2. SQL: rondas del jugador con score, filtradas por rango de fecha.
  let q = supabase
    .from('historical_rounds')
    .select('id, course_id, course_name, played_at, total_gross, holes_played, scores, import_source')
    .eq('user_id', userId)
    .not('total_gross', 'is', null)
  if (filters.desde) q = q.gte('played_at', `${filters.desde}T00:00:00`)
  if (filters.hasta) q = q.lte('played_at', `${filters.hasta}T23:59:59`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  let rows = (data ?? []) as Row[]

  // 3. Filtro de cancha en memoria: course_id canónico O coincidencia de nombre.
  if (courseRef) {
    const needle = normalize(courseRef)
    rows = rows.filter(r => {
      if (resolvedCourseId && r.course_id === resolvedCourseId) return true
      const name = r.course_name ? normalize(r.course_name) : ''
      return name.includes(needle) || (needle.length > 0 && name.length > 0 && needle.includes(name))
    })
  }

  // 4. Filtro hole-count.
  if (filters.holes === 9 || filters.holes === 18) {
    rows = rows.filter(r => inferHoles(r) === filters.holes)
  }

  // 5. Orden.
  const orden = filters.orden ?? 'reciente'
  rows.sort((a, b) => {
    if (orden === 'mejor' || orden === 'peor') {
      const av = a.total_gross ?? Number.POSITIVE_INFINITY
      const bv = b.total_gross ?? Number.POSITIVE_INFINITY
      return orden === 'mejor' ? av - bv : bv - av
    }
    const at = a.played_at ?? ''
    const bt = b.played_at ?? ''
    return orden === 'antigua' ? at.localeCompare(bt) : bt.localeCompare(at)
  })

  // 6. Limit + shape.
  const limit = Math.max(1, Math.min(30, filters.limit ?? 10))
  const rounds: CoachRound[] = rows.slice(0, limit).map(r => ({
    id: r.id,
    source: r.import_source ? 'importada' : 'en_vivo',
    fecha: r.played_at,
    course_id: r.course_id,
    cancha: r.course_name,
    total_gross: r.total_gross,
    holes_played: r.holes_played ?? inferHoles(r),
  }))

  return { count: rounds.length, rounds, resolved_course: resolvedCourse, note }
}
