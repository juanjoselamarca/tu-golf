/**
 * Capa de datos para `course_tees` (catálogo oficial de tees por cancha).
 *
 * La LÓGICA de resolución (qué CR/slope corresponde a un color+hoyos) vive en
 * `src/golf/courses/tee-resolver.ts` (pura, testeada). Acá solo el acceso a BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRatings, type TeeRow, type ResolvedRatings } from '@/golf/courses/tee-resolver'

/** Columnas reales de course_tees usadas por el resolver. */
const TEE_COLUMNS = 'nombre, genero, rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating'

/** Carga los tees de una cancha. Devuelve [] si no hay course_id o falla la query. */
export async function getTeesForCourse(
  supabase: SupabaseClient,
  courseId: string | null | undefined,
): Promise<TeeRow[]> {
  if (!courseId) return []
  const { data } = await supabase
    .from('course_tees')
    .select(TEE_COLUMNS)
    .eq('course_id', courseId)
  return (data as TeeRow[] | null) ?? []
}

/**
 * Resuelve CR/slope reales para una ronda contra el catálogo `course_tees`.
 * Devuelve `null` si no hay course_id, no hay tees, o el color no matchea con
 * confianza → el caller usa su fallback (valor del archivo) sin inventar.
 *
 * `genero` ('M'/'F', de `profiles.genero`) desambigua tees del mismo color por
 * género. Si no se conoce o el color queda ambiguo (entre géneros o loops), el
 * resolver devuelve null (no adivina).
 */
export async function resolveTeeRatingsForCourse(
  supabase: SupabaseClient,
  courseId: string | null | undefined,
  teeColor: string | null | undefined,
  holesPlayed: number | null | undefined,
  genero?: string | null,
): Promise<ResolvedRatings | null> {
  const tees = await getTeesForCourse(supabase, courseId)
  if (tees.length === 0) return null
  return resolveRatings(tees, teeColor, holesPlayed, genero ?? null)
}
