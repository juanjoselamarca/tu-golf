// src/lib/mi-golf/par.ts

/**
 * Par de referencia según hoyos jugados.
 * - 9 hoyos → 36
 * - 18 hoyos (o null/default) → 72
 *
 * Mismo criterio usado en `src/app/api/gwi/ronda-libre/route.ts`.
 * Fix permanente (futuro): leer el par real de la cancha desde `courses.par_total`.
 */
export function getParForHoles(holes_played: number | null | undefined): number {
  if (holes_played == null) return 72
  return holes_played <= 9 ? 36 : 72
}

/**
 * Calcula gross vs par de forma consciente de 9 vs 18 hoyos.
 * Retorna null si no hay total_gross.
 */
export function getVsPar(
  total_gross: number | null,
  holes_played: number | null | undefined
): number | null {
  if (total_gross == null) return null
  return total_gross - getParForHoles(holes_played)
}
