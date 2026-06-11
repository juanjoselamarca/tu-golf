/**
 * Capa de datos del dedup de canchas (aplicación idempotente).
 *
 * La LÓGICA pura (qué corregir) vive en `src/golf/courses/course-dedup.ts`
 * (`planTeeCorrections`, `findDuplicateRounds`). Acá solo el acceso a BD.
 *
 * Idempotencia (spec §11 M3): `applyTeeCorrections` decide UPDATE vs INSERT por
 * el ESTADO REAL de la BD (match case-insensitive por identidad), no por el
 * `action` planificado. Correrla N veces converge al mismo estado sin duplicar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeeUpsert } from '@/golf/courses/course-dedup'

/**
 * Busca el id del tee manual por identidad real (course_id + nombre
 * case-insensitive + género). Carga los tees de la cancha (≤ una decena) y matchea
 * en memoria — evita que `ilike` interprete `%`/`_` de un nombre multi-loop como
 * comodín (un `azul_andes` no debe matchear `azulXandes`).
 */
async function findTeeId(
  supabase: SupabaseClient,
  courseId: string,
  nombre: string,
  genero: string | null,
): Promise<string | null> {
  const { data, error } = await supabase.from('course_tees').select('id, nombre, genero').eq('course_id', courseId)
  if (error) throw new Error(`course_tees select falló para ${courseId}: ${error.message}`)
  const rows = (data as { id: string; nombre: string; genero: string | null }[] | null) ?? []
  const hit = rows.find(r => r.nombre.toLowerCase() === nombre.toLowerCase() && (r.genero ?? null) === (genero ?? null))
  return hit?.id ?? null
}

/**
 * Aplica las correcciones de tee a la ficha manual. Para cada upsert:
 *  - busca la fila por identidad real (usa `manualNombre` si lo trae, si no el
 *    `nombre` oficial); si existe → UPDATE de ESA fila por id.
 *  - si no existe → INSERT con el nombre oficial (`fuente='dedup-oficial'`).
 * El `action` del plan es advisory: la decisión real la toma el estado de la BD,
 * de modo que correrlo dos veces no inserta duplicados.
 */
export async function applyTeeCorrections(
  supabase: SupabaseClient,
  courseId: string,
  ups: TeeUpsert[],
): Promise<{ updated: number; inserted: number }> {
  let updated = 0, inserted = 0
  for (const u of ups) {
    const fields = {
      rating: u.rating, slope: u.slope,
      front_course_rating: u.front_course_rating, front_slope_rating: u.front_slope_rating,
      back_course_rating: u.back_course_rating, back_slope_rating: u.back_slope_rating,
    }
    const lookupNombre = u.manualNombre ?? u.nombre
    const existingId = await findTeeId(supabase, courseId, lookupNombre, u.genero)
    if (existingId) {
      const { error } = await supabase.from('course_tees').update(fields).eq('id', existingId)
      if (error) throw new Error(`update tee ${existingId} falló: ${error.message}`)
      updated++
    } else {
      const { error } = await supabase.from('course_tees').insert({
        course_id: courseId, nombre: u.nombre, genero: u.genero, fuente: 'dedup-oficial', ...fields,
      })
      if (error) throw new Error(`insert tee ${u.nombre}/${u.genero} falló: ${error.message}`)
      inserted++
    }
  }
  return { updated, inserted }
}

/** Redirige una ficha duplicada a la canónica y la desactiva (idempotente: valor absoluto). */
export async function redirectCourse(supabase: SupabaseClient, fromId: string, toId: string): Promise<void> {
  const { error } = await supabase.from('courses').update({ canonical_course_id: toId, activa: false }).eq('id', fromId)
  if (error) throw new Error(`redirect course ${fromId} falló: ${error.message}`)
}

/**
 * Repunta rondas de una ficha a otra. Devuelve el número REALMENTE movido,
 * medido con selects independientes antes/después (no se confía en el `.select()`
 * del update — spec §11 minor).
 */
export async function repointRounds(supabase: SupabaseClient, fromCourseId: string, toCourseId: string): Promise<number> {
  const before = await countRoundsForCourse(supabase, fromCourseId)
  if (before === 0) return 0
  const { error } = await supabase.from('historical_rounds').update({ course_id: toCourseId }).eq('course_id', fromCourseId)
  if (error) throw new Error(`repoint rounds ${fromCourseId}→${toCourseId} falló: ${error.message}`)
  const after = await countRoundsForCourse(supabase, fromCourseId)
  return before - after
}

/** Borra rondas por id. Devuelve cuántas se borraron. */
export async function deleteRounds(supabase: SupabaseClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.from('historical_rounds').delete().in('id', ids).select('id')
  if (error) throw new Error(`delete rounds falló: ${error.message}`)
  return (data as unknown[] | null)?.length ?? 0
}

/** Cuenta rondas que apuntan a una ficha (guardia de fedegolf-con-rondas-inesperadas). */
export async function countRoundsForCourse(supabase: SupabaseClient, courseId: string): Promise<number> {
  const { count, error } = await supabase
    .from('historical_rounds')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
  if (error) throw new Error(`count rounds para ${courseId} falló: ${error.message}`)
  return count ?? 0
}
