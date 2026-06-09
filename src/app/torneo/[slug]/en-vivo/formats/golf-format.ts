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

/**
 * Posiciones de un leaderboard YA ORDENADO (mejor primero), con empates al
 * estilo golf: dos competidores con el MISMO valor de ranking comparten posición
 * y llevan prefijo "T", y la siguiente posición salta el hueco.
 *
 *   rankValues [-1, 3, 3, 6]  →  ["1", "T2", "T2", "4"]
 *
 * Sólo compara igualdad de valores adyacentes (el array viene ordenado), así que
 * funciona igual para métricas donde "menos es mejor" (neto, vs par) o "más es
 * mejor" (stableford). El caller pasa el valor que decidió el orden.
 */
export function computePositions(rankValues: number[]): string[] {
  const n = rankValues.length
  const place: number[] = []
  for (let i = 0; i < n; i++) {
    // Empata con el anterior → hereda su lugar; si no, su lugar es i+1 (salta huecos).
    place[i] = i > 0 && rankValues[i] === rankValues[i - 1] ? place[i - 1] : i + 1
  }
  return place.map((p, i) => {
    const tiedPrev = i > 0 && rankValues[i] === rankValues[i - 1]
    const tiedNext = i < n - 1 && rankValues[i] === rankValues[i + 1]
    return tiedPrev || tiedNext ? `T${p}` : `${p}`
  })
}
