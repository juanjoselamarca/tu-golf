// src/golf/courses/gender-variant.ts
//
// FedeGolf parte cada cancha en DOS filas de `courses`:
//   "C.G. Los Leones - Los Leones (VARONES)"  → tees género 'M' (incluye rojo/M)
//   "C.G. Los Leones - Los Leones (DAMAS)"    → tees género 'F'
// Es el mismo recorrido físico con rating distinto por género (ver
// docs/ARQUITECTURA.md "Modelo de canchas"). Este módulo es la fuente única
// para reconocer el género de una fila y emparejar sus variantes.
//
// Pendiente de migrar a esta fuente: `cleanCourseName`/`isDamas`/`isVarones`
// inline en `src/components/CourseSelector.tsx` (archivo en lista de sucios,
// rastreado en docs/REORDENAMIENTO_TRACKING.md).

export type CourseGender = 'M' | 'F'

const VARONES = /\s*\((VARONES|CABALLEROS)\)\s*/i
const DAMAS = /\s*\(DAMAS\)\s*/i

/** Género de una fila de `courses` según el marcador de su nombre, o null si no tiene. */
export function courseGenderOf(nombre: string): CourseGender | null {
  if (DAMAS.test(nombre)) return 'F'
  if (VARONES.test(nombre)) return 'M'
  return null
}

/**
 * Clave que comparten las variantes VARONES/DAMAS de una misma cancha:
 * club FedeGolf + nombre sin marcador de género, normalizado.
 */
export function genderVariantKey(nombre: string, fedegolfClubId: number | null): string {
  const base = nombre.replace(VARONES, ' ').replace(DAMAS, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return `${fedegolfClubId ?? 'null'}|${base}`
}

export interface CourseVariantRow {
  id: string
  nombre: string
  fedegolf_club_id: number | null
}

/**
 * Ids de todas las variantes de género de cada cancha pedida (incluida ella
 * misma). Una cancha sin marcador de género o sin pareja devuelve solo su id.
 */
export function genderVariantIds(
  courseIds: string[],
  catalog: CourseVariantRow[],
): Map<string, string[]> {
  const byId = new Map(catalog.map(c => [c.id, c]))
  const byKey = new Map<string, string[]>()
  for (const c of catalog) {
    if (!courseGenderOf(c.nombre)) continue
    const k = genderVariantKey(c.nombre, c.fedegolf_club_id)
    byKey.set(k, [...(byKey.get(k) ?? []), c.id])
  }
  const out = new Map<string, string[]>()
  for (const id of courseIds) {
    const c = byId.get(id)
    if (!c || !courseGenderOf(c.nombre)) {
      out.set(id, [id])
      continue
    }
    const siblings = byKey.get(genderVariantKey(c.nombre, c.fedegolf_club_id)) ?? [id]
    out.set(id, [id, ...siblings.filter(s => s !== id)])
  }
  return out
}
