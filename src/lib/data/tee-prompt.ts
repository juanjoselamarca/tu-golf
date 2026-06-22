/**
 * Estado del prompt de "tee por defecto".
 *
 * Red de seguridad del Punto 3 (#138): si el jugador importó tarjetas SIN tee
 * de salida (frecuente en archivos Garmin) y todavía no fijó su tee habitual,
 * esas rondas entran SIN CR/slope → no alimentan el índice. La celebración de
 * import pregunta el tee, pero el usuario la puede saltar (CTA siempre activo).
 * Este estado alimenta un banner persistente en /coach · /perfil para que nadie
 * quede sin índice por saltarse esa pantalla.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTeesForCourse } from './course-tees'
import { resolveRatings, type TeeRow } from '@/golf/courses/tee-resolver'
import { TEE_COLOR_OPTIONS } from '@/golf/courses/tee-colors'

export interface TeePromptStatus {
  /** Mostrar el banner: hay rondas recuperables y aún no fijó su tee. */
  show: boolean
  /** Cuántas rondas sin tee se recalcularían al elegir (course_id resuelto). */
  recoverableRounds: number
  /**
   * Género del jugador si ya está en el perfil ('M' | 'F'), o null. El recompute
   * lo necesita para desambiguar tees del mismo color en canchas con set por
   * género (DAMAS/VARONES). Si es null, el banner debe pedirlo (igual que la
   * celebración) — sin esto las rondas en canchas con tees por género no se
   * recuperan y el usuario queda sin índice.
   */
  genero: 'M' | 'F' | null
}

const NONE: TeePromptStatus = { show: false, recoverableRounds: 0, genero: null }

/** Los colores que el banner ofrece elegir (decisión de producto, 1 vez). */
const BANNER_COLORS = TEE_COLOR_OPTIONS.map(o => o.color)

/**
 * ¿Esta ronda sin tee es recuperable de verdad? Lo es si el catálogo de la
 * cancha resuelve un CR/slope confiable para AL MENOS uno de los colores que el
 * banner ofrece, dado el género del jugador. Si la cancha no tiene tees, o todos
 * sus colores son ambiguos (multi-recorrido con ratings distintos), `resolveRatings`
 * devuelve null para todos → la ronda NO se puede recuperar con este flujo.
 *
 * Esto evita que el banner prometa recuperar rondas que jamás va a poder tocar
 * (Garmin sin tee en canchas fuera de catálogo, o loops Norte/Sur/Este sin saber
 * cuál se jugó): el usuario elegía su color, el índice no cambiaba, y el banner
 * "no funcionaba". Contar solo lo recuperable de verdad = promesa honesta.
 */
function isRoundRecoverable(
  tees: TeeRow[],
  holesPlayed: number | null,
  genero: 'M' | 'F' | null,
): boolean {
  if (!Array.isArray(tees) || tees.length === 0) return false
  return BANNER_COLORS.some(color => resolveRatings(tees, color, holesPlayed, genero) != null)
}

/**
 * `show` es true cuando: (1) el perfil NO tiene `default_tee_color`, y (2) existe
 * al menos una ronda con `tee_color IS NULL` y `course_id` vinculado que el
 * catálogo puede recuperar de verdad (ver `isRoundRecoverable`). Si el usuario ya
 * fijó su tee, no tiene rondas recuperables, o ninguna ronda sin tee es resoluble
 * desde el catálogo, no se muestra nada — para no prometer un recálculo imposible.
 */
export async function getTeePromptStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeePromptStatus> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_tee_color, genero')
    .eq('id', userId)
    .maybeSingle()

  // Ya fijó su tee → nada que pedir.
  if (profile?.default_tee_color) return NONE

  const generoRaw = (profile?.genero ?? '').toString().trim().toUpperCase()
  const genero = generoRaw === 'M' || generoRaw === 'F' ? (generoRaw as 'M' | 'F') : null

  // Candidatas: sin tee pero con cancha vinculada (las que el recompute mira).
  const { data: rounds } = await supabase
    .from('historical_rounds')
    .select('id, course_id, holes_played')
    .eq('user_id', userId)
    .is('tee_color', null)
    .not('course_id', 'is', null)

  if (!rounds || rounds.length === 0) return { ...NONE, genero }

  // Cache de tees por cancha: muchas rondas comparten course_id → 1 query por
  // cancha, no por ronda (escala para usuarios con cientos de tarjetas sin tee).
  const teeCache = new Map<string, TeeRow[]>()
  async function teesFor(courseId: string): Promise<TeeRow[]> {
    if (!teeCache.has(courseId)) teeCache.set(courseId, await getTeesForCourse(supabase, courseId))
    return teeCache.get(courseId)!
  }

  let recoverableRounds = 0
  for (const r of rounds) {
    if (!r.course_id) continue
    const tees = await teesFor(r.course_id)
    if (isRoundRecoverable(tees, r.holes_played ?? null, genero)) recoverableRounds++
  }

  return { show: recoverableRounds > 0, recoverableRounds, genero }
}
