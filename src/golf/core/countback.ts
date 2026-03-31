/**
 * Desempate por countback (USGA).
 *
 * Orden de comparación:
 *  1. Back 9  (hoyos 10-18)
 *  2. Back 6  (hoyos 13-18)
 *  3. Back 3  (hoyos 16-18)
 *  4. Hoyo 18 solo
 *  5. Card-off hoyo a hoyo desde el 1
 *
 * Funciona con cualquier modo: gross, neto, o stableford.
 */

export type CountbackMode = 'lower_wins' | 'higher_wins'

export interface CountbackPlayer {
  id: string
  name: string
  /** Scores por hoyo: índice 0 = hoyo 1, índice 17 = hoyo 18 */
  scores: number[]
  /** Score primario que generó el empate (gross total, neto total, puntos stableford) */
  primaryScore: number
}

export interface CountbackResult {
  id: string
  name: string
  primaryScore: number
  /** true si se resolvió por countback (no fue el único en su posición original) */
  resolvedByCountback: boolean
  /** Etiqueta para mostrar en leaderboard, ej: "(countback)" */
  annotation: string
}

/** Suma un rango de scores (hoyos 1-indexed: from y to inclusive) */
function sumRange(scores: number[], from: number, to: number): number {
  let total = 0
  for (let i = from - 1; i < to && i < scores.length; i++) {
    total += scores[i]
  }
  return total
}

/**
 * Compara dos jugadores empatados por countback.
 * Retorna <0 si a gana, >0 si b gana, 0 si siguen empatados.
 */
function compareCountback(
  a: CountbackPlayer,
  b: CountbackPlayer,
  mode: CountbackMode
): number {
  const sign = mode === 'higher_wins' ? -1 : 1

  // Rangos de countback USGA
  const ranges: [number, number][] = [
    [10, 18], // back 9
    [13, 18], // back 6
    [16, 18], // back 3
    [18, 18], // hole 18
  ]

  for (const [from, to] of ranges) {
    const sumA = sumRange(a.scores, from, to)
    const sumB = sumRange(b.scores, from, to)
    if (sumA !== sumB) return (sumA - sumB) * sign
  }

  // Card-off: hoyo a hoyo desde el 1
  const maxHoles = Math.min(a.scores.length, b.scores.length)
  for (let i = 0; i < maxHoles; i++) {
    const diff = a.scores[i] - b.scores[i]
    if (diff !== 0) return diff * sign
  }

  return 0 // verdadero empate total
}

/**
 * Aplica countback USGA a un grupo de jugadores empatados.
 *
 * @param players - Jugadores con el mismo score primario
 * @param mode - 'lower_wins' para stroke play (gross/neto), 'higher_wins' para stableford
 * @returns Array ordenado con anotaciones de countback
 */
export function applyCountback(
  players: CountbackPlayer[],
  mode: CountbackMode = 'lower_wins'
): CountbackResult[] {
  if (players.length <= 1) {
    return players.map((p) => ({
      id: p.id,
      name: p.name,
      primaryScore: p.primaryScore,
      resolvedByCountback: false,
      annotation: '',
    }))
  }

  const sorted = [...players].sort((a, b) => compareCountback(a, b, mode))

  return sorted.map((p, idx) => {
    // Verificar si realmente se separó de los demás
    const stillTied =
      (idx > 0 && compareCountback(sorted[idx - 1], p, mode) === 0) ||
      (idx < sorted.length - 1 && compareCountback(p, sorted[idx + 1], mode) === 0)

    const wasResolved = !stillTied && players.length > 1

    return {
      id: p.id,
      name: p.name,
      primaryScore: p.primaryScore,
      resolvedByCountback: wasResolved,
      annotation: wasResolved ? '(desempate)' : stillTied ? '(empate)' : '',
    }
  })
}

/**
 * Dado un leaderboard completo, agrupa empatados y aplica countback.
 * Los jugadores ya deben venir ordenados por su score primario.
 *
 * @param players - Leaderboard ordenado por primaryScore
 * @param mode - 'lower_wins' o 'higher_wins'
 * @returns Leaderboard re-ordenado con anotaciones de countback
 */
export function resolveLeaderboardTies(
  players: CountbackPlayer[],
  mode: CountbackMode = 'lower_wins'
): CountbackResult[] {
  const results: CountbackResult[] = []

  let i = 0
  while (i < players.length) {
    // Encontrar grupo de empatados
    let j = i + 1
    while (j < players.length && players[j].primaryScore === players[i].primaryScore) {
      j++
    }

    const tiedGroup = players.slice(i, j)
    if (tiedGroup.length === 1) {
      results.push({
        id: tiedGroup[0].id,
        name: tiedGroup[0].name,
        primaryScore: tiedGroup[0].primaryScore,
        resolvedByCountback: false,
        annotation: '',
      })
    } else {
      results.push(...applyCountback(tiedGroup, mode))
    }

    i = j
  }

  return results
}
