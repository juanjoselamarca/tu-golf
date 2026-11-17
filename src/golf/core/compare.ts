/**
 * Comparación de rondas — normaliza 9 vs 18 hoyos usando vsPar.
 * Resuelve el bug donde rondas de 9 hoyos parecían "mejores" por tener gross menor.
 */

export interface RoundForCompare {
  total_gross: number
  holes_played?: number | null
  par_total?: number | null   // par del recorrido completo (referencia del curso)
  par_played?: number | null  // par REAL de los hoyos con score (autoridad si es parcial)
  scores?: (number | null)[] | null
  vsPar?: number | null
}

/**
 * Calcula score vs par de una ronda.
 *
 * Prioridad de cálculo (regla del golf: vsPar SOLO sobre hoyos jugados):
 *   1. round.vsPar — si viene precalculado (autoridad).
 *   2. round.par_played — si el caller lo provee (real de hoyos jugados).
 *   3. Fallback: round.par_total o estimado por holes_played. Asume ronda
 *      completa; si es parcial y no se pasó par_played, el resultado puede
 *      ser incorrecto.
 *
 * Para rondas parciales, el caller DEBE pasar par_played o vsPar precalculado.
 */
export function vsPar(round: RoundForCompare): number {
  if (round.vsPar != null) return round.vsPar
  if (round.par_played != null) return round.total_gross - round.par_played
  const holes = round.holes_played ?? (round.scores?.length ?? 18)
  const par = round.par_total ?? (holes <= 9 ? 36 : 72)
  return round.total_gross - par
}

/**
 * Convierte par_per_hole (JSONB indexado por número de hoyo como string)
 * a array posicional. Devuelve undefined si la fuente está vacía o ausente.
 *
 * Caso: import-round / parser guarda { "1": 4, "2": 5, "3": 3, ... }.
 * Las pantallas necesitan [4, 5, 3, ...] alineado con scores[].
 */
export function parPerHoleArray(
  parPerHole: Record<string, number> | null | undefined,
  length: number
): number[] | undefined {
  if (!parPerHole) return undefined
  const arr: number[] = []
  let hasAny = false
  for (let i = 1; i <= length; i++) {
    const v = parPerHole[String(i)]
    if (typeof v === 'number' && Number.isFinite(v)) {
      arr.push(v); hasAny = true
    } else {
      arr.push(4) // fallback puntual por hoyo, mantiene alineación
    }
  }
  return hasAny ? arr : undefined
}

/**
 * Calcula el par jugado real de una ronda usando par_per_hole + scores.
 * Suma SOLO los pares de hoyos con score (no null/0).
 * Devuelve undefined si no hay par_per_hole disponible.
 */
export function parPlayedFromRound(
  scores: (number | null)[] | null | undefined,
  parPerHole: Record<string, number> | null | undefined
): number | undefined {
  if (!scores || !parPerHole) return undefined
  let sum = 0; let hasAny = false
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    if (s == null || s === 0) continue
    const p = parPerHole[String(i + 1)]
    if (typeof p === 'number' && Number.isFinite(p)) {
      sum += p; hasAny = true
    } else {
      sum += 4 // fallback puntual
    }
  }
  return hasAny ? sum : undefined
}
