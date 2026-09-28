// src/golf/courses/gender-variant.ts
//
// FedeGolf parte cada cancha en DOS filas de `courses`:
//   "C.G. Los Leones - Los Leones (VARONES)"  → tees género 'M' (incluye rojo/M)
//   "C.G. Los Leones - Los Leones (DAMAS)"    → tees género 'F'
// Es el mismo recorrido físico con rating distinto por género (ver
// docs/ARQUITECTURA.md "Modelo de canchas"). Este módulo es la fuente única
// para emparejar sus variantes (el marcador en sí lo reconoce course-name.ts).
//
// Pendiente de migrar a esta fuente: `cleanCourseName`/`isDamas`/`isVarones`
// inline en `src/components/CourseSelector.tsx` (archivo en lista de sucios,
// rastreado en docs/REORDENAMIENTO_TRACKING.md).

import { courseGenderMarker, stripGenderMarker } from './course-name'

export type CourseGender = 'M' | 'F'

/**
 * Género de una fila de `courses` según su marcador, en la convención de
 * `course_tees.genero` ('M' | 'F'). El reconocimiento del marcador vive en
 * `courseGenderMarker` (course-name.ts, fuente única); acá solo se traduce.
 */
export function courseGenderOf(nombre: string): CourseGender | null {
  const m = courseGenderMarker(nombre)
  return m === 'D' ? 'F' : m === 'V' ? 'M' : null
}

/**
 * Clave que comparten las variantes VARONES/DAMAS de una misma cancha:
 * club FedeGolf + nombre sin marcador de género, en minúsculas.
 */
export function genderVariantKey(nombre: string, fedegolfClubId: number | null): string {
  return `${fedegolfClubId ?? 'null'}|${stripGenderMarker(nombre).toLowerCase()}`
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
