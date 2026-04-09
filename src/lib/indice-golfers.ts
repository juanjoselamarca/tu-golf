/**
 * Índice Golfers+ — Utilidades de cálculo.
 * TypeScript puro — importable en server y client components.
 */

/**
 * Diferencial WHS para una ronda.
 * 18h: (gross - CR) × 113 / Slope
 * 9h:  (gross - CR_9h) × 113 / Slope_9h  (si hay ratings de 9h)
 *       Fallback 9h: (gross - CR/2) × 113 / (Slope)  — aproximación
 */
export function calcularDiferencial(
  totalGross: number,
  courseRating: number,
  slopeRating: number,
  holesPlayed?: number | null,
  nineHoleRatings?: { cr9h: number; slope9h: number } | null
): number | null {
  if (!totalGross || !slopeRating || slopeRating === 0) return null

  if (holesPlayed != null && holesPlayed <= 9) {
    // 9-hole differential
    if (nineHoleRatings?.cr9h && nineHoleRatings?.slope9h) {
      return parseFloat(((totalGross - nineHoleRatings.cr9h) * 113 / nineHoleRatings.slope9h).toFixed(2))
    }
    // Fallback: use half of 18h course rating
    if (courseRating) {
      return parseFloat(((totalGross - courseRating / 2) * 113 / slopeRating).toFixed(2))
    }
    return null
  }

  // 18-hole differential
  if (!courseRating) return null
  if (holesPlayed == null && totalGross < 60) return null // fallback heurístico
  return parseFloat(((totalGross - courseRating) * 113 / slopeRating).toFixed(2))
}

/**
 * Índice Golfers+ desde array de diferenciales.
 * Fórmula USGA: mejores N de las últimas 20 × 0.96
 * Retorna null si < 3 diferenciales.
 */
export function calcularIndiceGolfersLocal(diferenciales: number[]): number | null {
  if (diferenciales.length < 3) return null

  const sorted = [...diferenciales].sort((a, b) => a - b)
  const count = sorted.length

  const usar = count <= 6  ? 1
             : count <= 8  ? 2
             : count <= 11 ? 3
             : count <= 14 ? 4
             : count <= 16 ? 5
             : count === 17 ? 6
             : count <= 19 ? 7
             : 8

  const mejores = sorted.slice(0, usar)
  const promedio = mejores.reduce((a, b) => a + b, 0) / mejores.length
  return parseFloat((promedio * 0.96).toFixed(1))
}

/**
 * Nivel del jugador según rondas en los últimos 90 días.
 * 1=Rookie · 2=En Cancha · 3=Jugador Activo · 4=Scratch+ · 5=Golfer+
 */
export function calcularNivel(rondasUltimos90Dias: number): number {
  if (rondasUltimos90Dias >= 20) return 5
  if (rondasUltimos90Dias >= 12) return 4
  if (rondasUltimos90Dias >= 6)  return 3
  if (rondasUltimos90Dias >= 2)  return 2
  return 1
}

export const NIVEL_LABELS: Record<number, string> = {
  1: 'Rookie',
  2: 'En Cancha',
  3: 'Jugador Activo',
  4: 'Scratch+',
  5: 'Golfer+',
}

export const NIVEL_DESCRIPCION: Record<number, string> = {
  1: 'Registra tu primera ronda para empezar.',
  2: 'Estás en cancha. Sigue jugando.',
  3: 'Jugador consistente. tAIger+ te conoce bien.',
  4: 'Nivel avanzado. Tus datos alimentan análisis profundos.',
  5: 'El nivel más alto de Golfers+. Embajador del juego.',
}

/**
 * Cuenta cuántas rondas le faltan al usuario para activar el Índice Golfers+.
 * Retorna 0 si ya tiene suficientes.
 */
export function rondasParaActivar(rondasConDiferencial: number): number {
  return Math.max(0, 3 - rondasConDiferencial)
}
