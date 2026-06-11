/**
 * Helpers compartidos entre el dry-run y el apply del dedup (evita divergencia
 * de la lógica de merge en memoria — CERO FALLOS).
 */
import type { TeeRow } from '@/golf/courses/tee-resolver'
import type { TeeUpsert } from '@/golf/courses/course-dedup'

/** Aplica los upserts a los tees manuales EN MEMORIA (espejo de applyTeeCorrections). */
export function correctedTees(manual: TeeRow[], ups: TeeUpsert[]): TeeRow[] {
  const out = manual.map(t => ({ ...t }))
  const sameId = (a: TeeRow, nombre: string | null, genero: string | null) =>
    nombre != null && a.nombre.toLowerCase() === nombre.toLowerCase() && (a.genero ?? null) === (genero ?? null)
  for (const u of ups) {
    const fields = {
      rating: u.rating, slope: u.slope,
      front_course_rating: u.front_course_rating, front_slope_rating: u.front_slope_rating,
      back_course_rating: u.back_course_rating, back_slope_rating: u.back_slope_rating,
    }
    const target = out.find(t => sameId(t, u.manualNombre, u.genero))
    if (target) Object.assign(target, fields)
    else out.push({ nombre: u.nombre, genero: u.genero, ...fields })
  }
  return out
}
