/**
 * Lógica pura del dedup de canchas duplicadas (manual ↔ fedegolf).
 *
 * Decisión de diseño (spec 2026-06-10 §3, v2): la ficha MANUAL mixta es la
 * canónica. Sus tees se CORRIGEN a los valores oficiales fedegolf (fuente de
 * verdad de CR/slope 18h), conservando los front/back-9 que el oficial no traiga.
 * Las fichas fedegolf V/D se redirigen vía `canonical_course_id` y se desactivan.
 *
 * Sin acceso a BD acá: solo cálculo (testeado). La aplicación vive en
 * `src/lib/data/course-dedup.ts`.
 */
import { canonicalColor, type TeeRow } from './tee-resolver'

export interface TeeUpsert {
  /** Nombre del tee a persistir (oficial; para insert) / display. */
  nombre: string
  /** Nombre REAL del tee manual a actualizar (action='update'); null en insert. */
  manualNombre: string | null
  genero: string | null
  rating: number | null
  slope: number | null
  front_course_rating: number | null
  front_slope_rating: number | null
  back_course_rating: number | null
  back_slope_rating: number | null
  action: 'update' | 'insert'
}

/** Clave de identidad de tee: color canónico (mismo que el resolver) + género. */
function teeKey(t: { nombre: string; genero?: string | null }): string {
  const g = (t.genero ?? '').trim().charAt(0).toUpperCase()
  return `${canonicalColor(t.nombre ?? '')}|${g}`
}

/** Devuelve `official` si no es null/undefined, si no `manual` (sin perder un 9h existente). */
function pick<T>(official: T | null | undefined, manual: T | null | undefined): T | null {
  return official != null ? official : (manual ?? null)
}

/**
 * Para cada tee OFICIAL (fedegolf = fuente de verdad de 18h), devuelve el tee
 * corregido para la ficha manual: rating/slope del oficial; front/back del
 * oficial si existe, si no se conserva el de la manual (no se pierde el 9h).
 *
 * El match manual↔oficial es por COLOR CANÓNICO + género (igual que
 * `tee-resolver`), así `'Azul'`/`'azul'` y `'Negro'`/`'negras'` matchean. Para
 * `action:'update'` se carga `manualNombre` (el nombre REAL del tee manual) para
 * que el apply actualice ESA fila por su identidad real y NO inserte un duplicado.
 *
 * Tees manuales sin equivalente oficial NO se tocan (no aparecen en el output).
 */
export function planTeeCorrections(manualTees: TeeRow[], officialTees: TeeRow[]): TeeUpsert[] {
  const manualByKey = new Map(manualTees.map(t => [teeKey(t), t]))
  return officialTees.map(off => {
    const man = manualByKey.get(teeKey(off))
    return {
      nombre: off.nombre.trim().toLowerCase(),
      manualNombre: man ? man.nombre : null,
      genero: off.genero ?? null,
      rating: off.rating,
      slope: off.slope,
      front_course_rating: pick(off.front_course_rating, man?.front_course_rating),
      front_slope_rating: pick(off.front_slope_rating, man?.front_slope_rating),
      back_course_rating: pick(off.back_course_rating, man?.back_course_rating),
      back_slope_rating: pick(off.back_slope_rating, man?.back_slope_rating),
      action: man ? 'update' : 'insert',
    }
  })
}
