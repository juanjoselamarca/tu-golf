/**
 * Índice Golfers+ — Utilidades de cálculo.
 * TypeScript puro — importable en server y client components.
 */

import { alcanzaMinimoDeHoyosJugados, esScoreDe9Disperso, esTarjetaAMedias, MIN_HOYOS_JUGADOS_SCORE_9 } from '@/golf/core/ajuste-whs'

/**
 * CR/slope de 9 hoyos con los que se calcula un diferencial de 9: los publicados
 * del tee y, sin ellos, la aproximación CR/2 con el slope de 18. FUENTE ÚNICA:
 * el course handicap del tope WHS 3.1 (`grossAjustadoDeFila`) usa los MISMOS
 * ratings que el diferencial de esa ronda, nunca otros.
 */
export function ratingsDe9DelDiferencial(
  courseRating: number,
  slopeRating: number,
  nineHoleRatings?: { cr9h: number; slope9h: number } | null,
): { cr9h: number; slope9h: number } {
  return {
    cr9h: nineHoleRatings?.cr9h ?? courseRating / 2,
    slope9h: nineHoleRatings?.slope9h ?? slopeRating,
  }
}

/**
 * Fórmula pura del diferencial WHS. @internal — el gross que recibe tiene que ser
 * el Adjusted Gross Score (Regla 3.1, `grossAjustadoWHS`); los writers usan
 * `diferencialDeTarjeta`, que exige ese número por nombre. Llamarla con el bruto
 * es el bug del issue #545 (un 10 en un par 5 subía el índice como un 10).
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
  if (!courseRating) return null

  // Decisión 9h vs 18h: si holesPlayed está seteado, usarlo.
  // Si está null (legacy), inferir por el score bruto (<=55 típicamente es 9h).
  const is9h = holesPlayed != null
    ? holesPlayed <= 9
    : totalGross <= 55

  if (is9h) {
    // WHS 9-hole Score Differential.
    //   9h SD = (9h gross − 9h CR) × 113 / 9h Slope
    // Sin 9h CR/Slope explícitos: usar 18h CR/2 y 18h Slope como aproximación.
    // Luego se escala × 2 para obtener un "equivalente 18h" comparable con los
    // otros diferenciales en el cálculo del índice (aproximación práctica USGA
    // cuando no hay un segundo 9h con el cual combinar).
    const { cr9h: cr9, slope9h: slope9 } = ratingsDe9DelDiferencial(courseRating, slopeRating, nineHoleRatings)
    const sd9 = (totalGross - cr9) * 113 / slope9
    return parseFloat((sd9 * 2).toFixed(2))
  }

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


/**
 * Diferencial de una tarjeta de ronda libre al cerrarla. FUENTE ÚNICA de la
 * decisión que los dos finalizadores tomaban cada uno por su lado. Recibe el
 * ADJUSTED GROSS (`grossAjustadoWHS`, WHS 3.1), nunca el bruto: el nombre del
 * campo lo obliga en compilación.
 *   - sin slope o CR de cancha → null (no hay con qué calcular);
 *   - menos de 9 hoyos → null;
 *   - scramble / foursome (bola compartida) → null: el score es del equipo,
 *     no ajusta el handicap individual (USGA/R&A);
 *   - tarjeta a medias (10-17 hoyos, ninguno estimado: `esTarjetaAMedias`) → null;
 *   - 9 hoyos que no son una mitad de la cancha (`esScoreDe9Disperso`) → null.
 * Es la regla de TODOS los caminos (guardado, edición, recompute por tee,
 * backfill): ninguno decide por su lado si una tarjeta incompleta da diferencial.
 */
export function diferencialDeTarjeta(input: {
  /** Adjusted Gross Score (`grossAjustadoWHS`): cada hoyo topado en doble bogey neto. */
  grossAjustado: number
  /** Hoyos de la tarjeta: los jugados más los estimados por no jugarse. */
  holesPlayed: number
  /** Hoyos de la tarjeta estimados porque no se jugaron (`hoyosNoJugadosEstimados`). */
  hoyosNoJugados?: number
  /** Números reales de los hoyos con golpes (`hoyosConGolpes`); null = tarjeta sin golpes por hoyo. */
  hoyosJugados?: readonly number[] | null
  ratings: { slope: number | null; cr: number | null; nineHole: { cr9h: number; slope9h: number } | null }
  bolaCompartida: boolean
}): number | null {
  const { slope, cr, nineHole } = input.ratings
  if (input.bolaCompartida) return null
  if (!slope || !cr || input.holesPlayed < MIN_HOYOS_JUGADOS_SCORE_9) return null
  // WHS 2.2: hoyos JUGADOS (los estimados por no jugarse no cuentan para el mínimo).
  if (!alcanzaMinimoDeHoyosJugados(input.holesPlayed, input.hoyosNoJugados ?? 0)) return null
  if (esTarjetaAMedias(input.holesPlayed, input.hoyosNoJugados ?? 0)) return null
  if (esScoreDe9Disperso(input.holesPlayed, input.hoyosJugados)) return null
  return calcularDiferencial(input.grossAjustado, cr, slope, input.holesPlayed, nineHole)
}
