// ============================================================
// GARMIN GOLF COLOR SYSTEM — REGLA DEFINITIVA
// ============================================================
// Esta es la UNICA fuente de verdad para los colores de Garmin Golf.
// NO MODIFICAR sin verificacion contra capturas reales de la app.
// Verificado: 24 Mar 2026 por Juanjo + Claude contra 6 fotos reales.
//
// FORMATO 1 (Scorecard — vista detalle de una ronda):
//   - Azul oscuro circulo = Eagle o mejor (-2 o menos)
//   - Celeste circulo     = Birdie (-1)
//   - Sin borde           = Par (0)
//   - Dorado/naranja cuadrado = Bogey (+1)
//   - Rojo cuadrado       = Doble bogey o peor (+2 o mas)
//
// FORMATO 2 (Activity list — barra de colores):
//   - Azul oscuro segmento = Eagle o mejor (-2 o menos)
//   - Celeste segmento     = Birdie (-1)
//   - Verde segmento       = Par (0)
//   - Dorado/naranja segmento = Bogey (+1)
//   - Rojo segmento        = Doble bogey o peor (+2 o mas)
// ============================================================

/**
 * Maps a Garmin color name to the score relative to par.
 * Returns the MINIMUM differential for that color.
 * For "red" (double bogey+), the base is +2 but could be +3, +4, etc.
 */
export const GARMIN_COLOR_TO_DIFF: Record<string, number> = {
  dark_blue: -2,  // eagle or better
  blue: -2,       // alias for dark_blue
  light_blue: -1, // birdie
  celeste: -1,    // alias for light_blue
  green: 0,       // par (activity bar only)
  none: 0,        // par (scorecard — no border)
  gold: 1,        // bogey
  orange: 1,      // alias for gold
  amber: 1,       // alias for gold
  red: 2,         // double bogey (minimum, could be +3, +4, etc.)
}

/**
 * Colors that could hide extra strokes beyond their base.
 * Only "red" is ambiguous — could be +2, +3, +4, +5, etc.
 */
export const AMBIGUOUS_COLORS = ['red']

/**
 * Converts a color from Claude Vision response to our canonical name.
 * Claude might return various spellings — normalize here.
 */
export function normalizeGarminColor(color: string): string {
  const c = color.toLowerCase().trim().replace(/[_-]/g, '')
  if (c === 'darkblue' || c === 'navy') return 'dark_blue'
  if (c === 'lightblue' || c === 'celeste' || c === 'cyan') return 'light_blue'
  if (c === 'green' || c === 'lime') return 'green'
  if (c === 'gold' || c === 'orange' || c === 'amber' || c === 'yellow') return 'gold'
  if (c === 'red' || c === 'crimson' || c === 'darkred') return 'red'
  if (c === 'blue') return 'light_blue' // generic "blue" = birdie (celeste)
  return 'green' // unknown = par (safest default)
}

/**
 * Gets the score diff relative to par for a given Garmin color.
 */
export function colorToDiff(color: string): number {
  const normalized = normalizeGarminColor(color)
  return GARMIN_COLOR_TO_DIFF[normalized] ?? 0
}

/**
 * Checks if a color is ambiguous (could hide extra strokes).
 */
export function isAmbiguousColor(color: string): boolean {
  return AMBIGUOUS_COLORS.includes(normalizeGarminColor(color))
}
