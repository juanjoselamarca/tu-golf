/**
 * Reglas universales de golf — types y utilidades base.
 * Fuente de verdad para ModoJuego, labels y formateo.
 */

export type ModoJuego = 'gross' | 'neto' | 'stableford'

/** Label textual de un resultado vs par */
export function labelResultado(overUnder: number): string {
  if (overUnder <= -3) return 'albatros'
  if (overUnder === -2) return 'eagle'
  if (overUnder === -1) return 'birdie'
  if (overUnder === 0)  return 'par'
  if (overUnder === 1)  return 'bogey'
  if (overUnder === 2)  return 'doble'
  return 'triple+'
}

/** Formatear over/under: 0 → "E", +3 → "+3", -2 → "-2" */
export function formatOverUnder(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}
