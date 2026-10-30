// src/golf/courses/tee-yardage-column.ts
//
// Qué columna de yardaje de `course_holes` corresponde a un tee.
//
// FUENTE ÚNICA. Había tres copias de este mapeo con tres criterios distintos:
// `lib/ronda/helpers` caía a azul, `lib/save-course-snapshot` caía a blanco y
// `types/ronda` devolvía null. Las dos primeras le mostraban a un jugador del
// tee dorado —48 canchas activas del catálogo— el yardaje de OTRO tee, sin
// avisar. Acá hay un solo criterio: si la columna no existe, `null`. La tabla
// tiene cuatro columnas de yardaje y el catálogo diez colores; para los otros
// seis no hay dato, y no hay dato se dice, no se reemplaza.

import { canonicalColor } from './tee-resolver'

/** Las cuatro columnas de yardaje por tee que existen en `course_holes`. */
export type ColumnaDeYardaje =
  | 'yardaje_negras'
  | 'yardaje_azul'
  | 'yardaje_blanco'
  | 'yardaje_rojo'

/** Clave corta de la columna, para los callers que arman `{ negras, azul, … }`. */
export type ClaveDeYardaje = 'negras' | 'azul' | 'blanco' | 'rojo'

export const CLAVES_DE_YARDAJE: ClaveDeYardaje[] = ['negras', 'azul', 'blanco', 'rojo']

// Por raíz canónica: cubre plural, género, acentos y los sinónimos EN→ES
// ("black"/"blue"/"white"/"red") que ya resuelve `canonicalColor`.
const POR_RAIZ = new Map<string, ClaveDeYardaje>([
  [canonicalColor('negras'), 'negras'],
  [canonicalColor('azul'), 'azul'],
  [canonicalColor('blanco'), 'blanco'],
  [canonicalColor('rojo'), 'rojo'],
  // Alias que no son un color: así los nombran algunos catálogos externos.
  [canonicalColor('campeonato'), 'negras'],
  [canonicalColor('championship'), 'negras'],
])

/**
 * Clave de yardaje del tee, o `null` si la tabla no tiene una columna para él
 * (dorado, gris, amarillo, verde…). `null` significa "no hay dato", nunca
 * "usa el de otro tee".
 */
export function claveDeYardaje(tee: string | null | undefined): ClaveDeYardaje | null {
  if (!tee) return null
  return POR_RAIZ.get(canonicalColor(tee)) ?? null
}

/** Igual que `claveDeYardaje`, con el nombre completo de la columna. */
export function columnaDeYardaje(tee: string | null | undefined): ColumnaDeYardaje | null {
  const clave = claveDeYardaje(tee)
  return clave ? (`yardaje_${clave}` as ColumnaDeYardaje) : null
}
