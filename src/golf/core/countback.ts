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
 * Segmentos de countback USGA según el nº de hoyos de la ronda.
 * Se comparan los últimos 9/6/3/1 hoyos (18h) o los últimos 6/3/1 (9h): un
 * segmento igual o mayor que la ronda se descarta (repetiría la tarjeta entera,
 * que es el empate mismo). En 18h da exactamente [10,18],[13,18],[16,18],[18,18].
 */
function countbackSegments(holeCount: number): [number, number][] {
  return [9, 6, 3, 1]
    .filter((k) => k < holeCount)
    .map((k) => [holeCount - k + 1, holeCount] as [number, number])
}

/**
 * Compara dos jugadores empatados por countback.
 * Retorna <0 si a gana, >0 si b gana, 0 si siguen empatados.
 *
 * `holeCount` = nº de hoyos de la ronda (18 o 9). Determina los segmentos de
 * back-count; por defecto 18 para no cambiar el path de 18 hoyos.
 */
function compareCountback(
  a: CountbackPlayer,
  b: CountbackPlayer,
  mode: CountbackMode,
  holeCount: number = 18
): number {
  const sign = mode === 'higher_wins' ? -1 : 1

  // Rangos de countback USGA relativos al nº de hoyos jugados.
  const ranges = countbackSegments(holeCount)

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
  mode: CountbackMode = 'lower_wins',
  holeCount: number = 18
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

  const sorted = [...players].sort((a, b) => compareCountback(a, b, mode, holeCount))

  return sorted.map((p, idx) => {
    // Verificar si realmente se separó de los demás
    const stillTied =
      (idx > 0 && compareCountback(sorted[idx - 1], p, mode, holeCount) === 0) ||
      (idx < sorted.length - 1 && compareCountback(p, sorted[idx + 1], mode, holeCount) === 0)

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
  mode: CountbackMode = 'lower_wins',
  holeCount: number = 18
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
      results.push(...applyCountback(tiedGroup, mode, holeCount))
    }

    i = j
  }

  return results
}
