/**
 * Cómo se ESCRIBEN los puntos de una Timba libre (fuente única): con signo, y el menos tipográfico como en la
 * spec ("+2", "0", "−2"). No es un resultado vs par: 0 es "0", no "E".
 */
export function formatPuntosTimba(puntos: number): string {
  if (puntos > 0) return `+${puntos}`
  if (puntos < 0) return `−${Math.abs(puntos)}`
  return '0'
}
