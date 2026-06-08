// Formato compartido de números de golf para los leaderboards públicos
// (IndividualLeaderboard + TeamLeaderboard). Antes estaba duplicado byte a byte
// en ambos; centralizarlo evita que diverjan y fija el tratamiento premium:
// signo menos tipográfico que alinea con el "+" bajo tabular-nums, y color de
// bajo-par para que el líder resalte (convención de marca: negativo en dorado).

const MINUS = '−' // − (U+2212): mismo ancho que "+", alinea la columna "A par"

/** "+3" / "E" / "−1" (menos tipográfico para bajo par). */
export function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${MINUS}${Math.abs(vsPar)}`
}

/** "F" terminado · "—" sin empezar · número de hoyos jugados. El em dash evita
 *  confundir "sin empezar" con un score bajo par ("−1") en columnas vecinas. */
export function formatThru(thru: number, holeCount = 18): string {
  if (thru >= holeCount) return 'F'
  if (thru <= 0) return '—' // —
  return String(thru)
}

/** Color del valor "A par": bajo par en dorado de marca (resalta al líder),
 *  par/over par en el color neutro de la celda. Theme-aware vía --brand-on-bg. */
export function vsParColor(vsPar: number): string | undefined {
  return vsPar < 0 ? 'var(--brand-on-bg)' : undefined
}
