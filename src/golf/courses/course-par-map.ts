/**
 * FUENTE CANÓNICA del concepto "course_id → pares por número de hoyo".
 * Regla "un concepto, una fuente": existen 3 re-derivaciones inline del mismo
 * mapeo en el motor del coach (detect-and-save-patterns.ts, tools.ts, context.ts)
 * que deben converger acá cuando se toque ese flujo (ver docs/REORDENAMIENTO_TRACKING.md).
 * No se migran en este PR para no ensanchar el blast radius de un hotfix de datos.
 *
 * buildCourseParMap — arma el mapa course_id → [par hoyo1, par hoyo2, …]
 * INDEXANDO por `numero`, no por orden de llegada.
 *
 * Por qué existe (bug inbox 2268163d "los eagles no me calzan"):
 * el route paginaba course_holes con `.order('numero')` a secas. Como cientos
 * de canchas comparten cada valor de numero, Postgres no garantiza orden estable
 * entre requests `.range()` → filas dropeadas/desordenadas al cruzar páginas →
 * el array de pares de una cancha quedaba desalineado (17 hoyos en vez de 18) →
 * eagles/birdies/pares/bogeys mal contados. El route ahora ordena por
 * (course_id, numero) [clave única, paginación determinista] Y coloca cada par
 * en su índice `numero - 1`, de modo que el resultado es correcto aunque el
 * input llegue en cualquier orden.
 */
export function buildCourseParMap(
  holes: Array<{ course_id: string; numero: number; par: number }>,
): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const h of holes) {
    if (!map.has(h.course_id)) map.set(h.course_id, [])
    // Posición por número de hoyo (1-indexed → 0-indexed). Order-independent.
    map.get(h.course_id)![h.numero - 1] = h.par
  }
  return map
}
