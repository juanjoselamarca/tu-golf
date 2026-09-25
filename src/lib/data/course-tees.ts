/**
 * Capa de datos para `course_tees` (catálogo oficial de tees por cancha).
 *
 * La LÓGICA de resolución (qué CR/slope corresponde a un color+hoyos) vive en
 * `src/golf/courses/tee-resolver.ts` (pura, testeada). Acá solo el acceso a BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRatings, type TeeRow, type ResolvedRatings } from '@/golf/courses/tee-resolver'
import type { CourseTees } from '@/golf/courses/category-tee-options'
import { genderVariantIds, type CourseVariantRow } from '@/golf/courses/gender-variant'

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

/**
 * Nombres de tee (con género) de las canchas de un torneo, junto al nombre de
 * cada cancha. Une los tees de las variantes VARONES/DAMAS de cada cancha
 * (`genderVariantIds`), porque la ronda apunta a UNA fila y los tees del otro
 * género viven en la fila hermana. Alimenta el selector "Tee por defecto" de las
 * categorías del wizard (`categoryTeeOptions`). Mantiene el orden de `courseIds`.
 */
export async function getTeeNamesForCourses(
  supabase: SupabaseClient,
  courseIds: string[],
): Promise<CourseTees[]> {
  const ids = [...new Set(courseIds.filter(Boolean))]
  if (ids.length === 0) return []

  const { data: picked, error: pErr } = await supabase
    .from('courses')
    .select('id, nombre, fedegolf_club_id')
    .in('id', ids)
  if (pErr) throw new Error(`courses: ${pErr.message}`)
  const pickedRows = (picked ?? []) as CourseVariantRow[]

  // Las variantes de género comparten club FedeGolf: basta traer ese club.
  const clubIds = [...new Set(pickedRows.map(c => c.fedegolf_club_id).filter((v): v is number => v != null))]
  let catalog = pickedRows
  if (clubIds.length > 0) {
    const { data: siblings, error: sErr } = await supabase
      .from('courses')
      .select('id, nombre, fedegolf_club_id')
      .in('fedegolf_club_id', clubIds)
    if (sErr) throw new Error(`courses (variantes): ${sErr.message}`)
    catalog = [...pickedRows, ...((siblings ?? []) as CourseVariantRow[]).filter(s => !ids.includes(s.id))]
  }

  const variants = genderVariantIds(ids, catalog)
  const allIds = [...new Set([...variants.values()].flat())]
  const { data: tees, error: tErr } = await supabase
    .from('course_tees')
    .select('course_id, nombre, genero')
    .in('course_id', allIds)
  if (tErr) throw new Error(`course_tees: ${tErr.message}`)

  const nameById = new Map(pickedRows.map(c => [c.id, c.nombre]))
  return ids.map(id => {
    const variantIds = variants.get(id) ?? [id]
    return {
      courseId: id,
      courseName: nameById.get(id) ?? 'Cancha',
      tees: variantIds.flatMap(vid =>
        (tees ?? [])
          .filter(t => t.course_id === vid)
          .map(t => ({ nombre: t.nombre as string | null, genero: t.genero as string | null })),
      ),
    }
  })
}
