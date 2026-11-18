/**
 * Cómo se ESCRIBEN los puntos de una Timba libre (fuente única): con signo, y el menos tipográfico como en la
 * spec ("+2", "0", "−2"). No es un resultado vs par: 0 es "0", no "E".
 */
export function formatPuntosTimba(puntos: number): string {
  if (puntos > 0) return `+${puntos}`
  if (puntos < 0) return `−${Math.abs(puntos)}`
  return '0'
}

/** Un total de puntos con su unidad y sin "+": "18 pts", "1 pt", "0 pts", "−2 pts". */
export function formatPuntosConUnidad(puntos: number): string {
  const abs = Math.abs(puntos)
  return `${puntos < 0 ? '−' : ''}${abs} ${abs === 1 ? 'pt' : 'pts'}`
}
