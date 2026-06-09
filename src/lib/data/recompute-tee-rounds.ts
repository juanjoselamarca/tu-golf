/**
 * Aplica el color de tee por defecto del usuario a sus rondas SIN tee y recomputa
 * CR/slope/diferencial desde el catálogo. Para el Punto 3: cuando el usuario fija
 * su tee habitual, sus tarjetas viejas sin tee (que entraron sin diferencial)
 * recuperan su rating y vuelven a alimentar el índice.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTeesForCourse } from './course-tees'
import { resolveRatings, type TeeRow } from '@/golf/courses/tee-resolver'
import { calcularDiferencial } from '@/lib/indice-golfers'

/**
 * Recomputa las rondas del usuario que NO tienen tee_color pero SÍ tienen
 * course_id, usando `color` como tee. Resuelve CR/slope del catálogo y recalcula
 * el diferencial canónico. NO toca rondas que ya tienen un tee explícito.
 * Devuelve cuántas rondas se actualizaron.
 */
export async function applyDefaultTeeToRounds(
  supabase: SupabaseClient,
  userId: string,
  color: string,
): Promise<number> {
  const { data: rounds } = await supabase
    .from('historical_rounds')
    .select('id, course_id, total_gross, holes_played')
    .eq('user_id', userId)
    .is('tee_color', null)
    .not('course_id', 'is', null)
  if (!rounds || rounds.length === 0) return 0

  // Cache de tees por cancha: muchas rondas comparten course_id → 1 query por
  // cancha, no por ronda (escala para usuarios con cientos de tarjetas).
  const teeCache = new Map<string, TeeRow[]>()
  async function teesFor(courseId: string): Promise<TeeRow[]> {
    if (!teeCache.has(courseId)) teeCache.set(courseId, await getTeesForCourse(supabase, courseId))
    return teeCache.get(courseId)!
  }

  let updated = 0
  for (const r of rounds) {
    const tees = await teesFor(r.course_id)
    const resolved = resolveRatings(tees, color, r.holes_played)
    if (!resolved) continue
    const diferencial =
      r.total_gross != null
        ? calcularDiferencial(r.total_gross, resolved.cr, resolved.slope, r.holes_played, resolved.nineHoleRatings)
        : null
    const { error } = await supabase
      .from('historical_rounds')
      .update({
        tee_color: color,
        course_rating: resolved.cr,
        slope_rating: resolved.slope,
        diferencial,
      })
      .eq('id', r.id)
    if (!error) updated++
  }
  return updated
}
