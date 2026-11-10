// Formato compartido de números de golf para los leaderboards públicos
// (IndividualLeaderboard + TeamLeaderboard). Las posiciones con empate ("T2")
// viven en `@/golf/core/posiciones`. Antes estaba duplicado byte a byte
// en ambos; centralizarlo evita que diverjan y fija el tratamiento premium:
// signo menos tipográfico que alinea con el "+" bajo tabular-nums, y color de
// bajo-par para que el líder resalte (convención de marca: negativo en dorado).

const MINUS = '−' // − (U+2212): mismo ancho que "+", alinea la columna "A par"

/** "+3" / "E" / "−1" (menos tipográfico para bajo par). */
export function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${MINUS}${Math.abs(vsPar)}`
}

// Thru vive en el motor (convención PGA: hoyos terminados). Se re-exporta para
// los leaderboards de torneo que ya importan desde acá.
export { formatThru } from '@/golf/leaderboard/thru'

/** Color del valor "A par": bajo par en dorado de marca (resalta al líder),
 *  par/over par en el color neutro de la celda. Theme-aware vía --brand-on-bg. */
export function vsParColor(vsPar: number): string | undefined {
  return vsPar < 0 ? 'var(--brand-on-bg)' : undefined
}
