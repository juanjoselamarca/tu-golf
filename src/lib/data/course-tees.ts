/**
 * Capa de datos para `course_tees` (catálogo oficial de tees por cancha).
 *
 * La LÓGICA de resolución (qué CR/slope corresponde a un color+hoyos) vive en
 * `src/golf/courses/tee-resolver.ts` (pura, testeada). Acá solo el acceso a BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRatings, type TeeRow, type ResolvedRatings } from '@/golf/courses/tee-resolver'
import type { CourseTees } from '@/golf/courses/category-tee-options'
import { courseGenderOf, genderVariantIds, type CourseVariantRow } from '@/golf/courses/gender-variant'
import { COURSE_TEE_COLUMNS, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'

/** Cliente mínimo (sirve anon, ssr o service role). */
type MinimalClient = Pick<SupabaseClient, 'from'>

/** Columnas de `courses` que necesita `genderVariantIds`. Fuente única del SELECT. */
export const COURSE_VARIANT_COLUMNS = 'id, nombre, fedegolf_club_id'

/**
 * Tees (columnas canónicas de `CourseTeeRow`) de la variante de género HERMANA
 * de una cancha FedeGolf: la fila DAMAS de una VARONES y viceversa. Vacío si la
 * cancha no tiene marcador de género o no tiene pareja — y en ese caso NO va a
 * la BD.
 *
 * Existe porque el torneo apunta a UNA fila y `resolvePlayerTee` elige el tee
 * del género del jugador entre las dos: sin los tees de la hermana, una
 * jugadora en un torneo VARONES recibe el rating masculino de su tee.
 *
 * Camino de GATE/BOARD: un error de la BD se PROPAGA. Degradarlo a `[]` haría
 * que el handicap de las jugadoras cambie en silencio entre dos refresh.
 */
export async function getSiblingVariantTees(
  supabase: MinimalClient,
  course: CourseVariantRow,
): Promise<CourseTeeRow[]> {
  if (!course.nombre || !courseGenderOf(course.nombre) || course.fedegolf_club_id == null) return []

  // UNA query: los tees de todas las fichas del club, con su ficha embebida
  // (`courses!inner` permite filtrar por una columna de la ficha). Esto corre
  // en el camino caliente de cada board y de cada `upsert_score`; dos viajes
  // en serie (fichas del club → tees) eran latencia pura.
  const { data, error } = await supabase
    .from('course_tees')
    .select(`${COURSE_TEE_COLUMNS}, course_id, courses!inner(${COURSE_VARIANT_COLUMNS})`)
    .eq('courses.fedegolf_club_id', course.fedegolf_club_id)
  if (error) throw new Error(`course_tees (variantes de género): ${error.message}`)

  type Row = CourseTeeRow & { course_id: string; courses: CourseVariantRow | null }
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.courses)

  const catalog = new Map<string, CourseVariantRow>([[course.id, course]])
  for (const r of rows) if (r.courses && !catalog.has(r.courses.id)) catalog.set(r.courses.id, r.courses)

  const siblings = new Set(
    (genderVariantIds([course.id], [...catalog.values()]).get(course.id) ?? []).filter((id) => id !== course.id),
  )
  if (siblings.size === 0) return []

  return rows
    .filter((r) => siblings.has(r.course_id))
    // Orden determinista (ficha, nombre): `resolvePlayerTee` toma "el primero"
    // entre iguales, y PostgREST no garantiza orden sin ORDER BY.
    .sort((a, b) => a.course_id.localeCompare(b.course_id) || a.nombre.localeCompare(b.nombre))
    .map(({ courses: _c, course_id: _id, ...tee }) => tee as CourseTeeRow)
}

/**
 * Los tees de la cancha PRIMERO y los de su variante de género después: el
 * orden que `resolvePlayerTee` necesita para que, sin género conocido, gane la
 * fila del torneo. Una sola función para el board, el scorer y el servidor.
 */
export async function getTeesWithGenderVariants(
  supabase: MinimalClient,
  course: CourseVariantRow,
  ownTees: CourseTeeRow[],
): Promise<CourseTeeRow[]> {
  const siblingTees = await getSiblingVariantTees(supabase, course)
  return siblingTees.length > 0 ? [...ownTees, ...siblingTees] : ownTees
}

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
