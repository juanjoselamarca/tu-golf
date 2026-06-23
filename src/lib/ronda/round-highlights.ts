export interface HighlightHole {
  hole: number
  par: number
  score: number
  diff: number
}

export interface RoundHighlightsData {
  bestHole: HighlightHole | null
  worstHole: HighlightHole | null
  desglose: {
    eagles: number
    birdies: number
    pares: number
    bogeys: number
    doublesPlus: number
  }
  holesPlayed: number
}

/**
 * Resume los hoyos de una ronda del usuario autenticado: mejor y peor hoyo
 * por diff vs par, y desglose de eagles/birdies/pares/bogeys/doubles+.
 *
 * Reglas:
 * - Ignora hoyos con score null, undefined o 0 (no jugados).
 * - bestHole = primer hoyo con menor diff (desempate por orden de hoyo).
 * - worstHole = primer hoyo con mayor diff (mismo criterio de desempate).
 * - Si holesPlayed === 0, bestHole y worstHole son null.
 * - Eagle es diff ≤ -2 (albatros también cuenta como eagle).
 * - Double+ es diff ≥ +2.
 *
 * Invariante (verificable en test):
 *   eagles·(-2) + birdies·(-1) + pares·0 + bogeys·1 + doublesPlus·2 ≈ overUnderGross
 *
 * El invariante es aproximado para doublesPlus porque un triple (+3) cuenta
 * igual que un doble (+2) en el count. Para fixtures sin triples es exacto.
 */
export function computeHighlights(
  scores: Record<number, number>,
  parMap: Record<number, number>,
  totalHoles: number,
): RoundHighlightsData {
  const desglose = { eagles: 0, birdies: 0, pares: 0, bogeys: 0, doublesPlus: 0 }
  let bestHole: HighlightHole | null = null
  let worstHole: HighlightHole | null = null
  let holesPlayed = 0

  for (let h = 1; h <= totalHoles; h++) {
    const score = scores[h]
    const par = parMap[h]
    if (score == null || score === 0 || par == null) continue

    holesPlayed++
    const diff = score - par
    const hole: HighlightHole = { hole: h, par, score, diff }

    if (diff <= -2) desglose.eagles++
    else if (diff === -1) desglose.birdies++
    else if (diff === 0) desglose.pares++
    else if (diff === 1) desglose.bogeys++
    else desglose.doublesPlus++

    if (bestHole === null || diff < bestHole.diff) bestHole = hole
    if (worstHole === null || diff > worstHole.diff) worstHole = hole
  }

  return { bestHole, worstHole, desglose, holesPlayed }
}

/**
 * Prepara los highlights del jugador autenticado para la pantalla de resultados.
 * Encapsula el parseo de scores (string→number, descarta no-positivos) + el
 * guard "jugó al menos un hoyo". Devuelve null si el jugador no está en la ronda
 * o no registró scores. Antes vivía como un IIFE embebido en el render.
 */
export function buildMyHighlights(
  jugadores: ReadonlyArray<{ user_id: string | null; scores: Record<string, number> | null }>,
  currentUserId: string,
  parMap: Record<number, number>,
  totalHoles: number,
): { data: RoundHighlightsData; scores: Record<number, number> } | null {
  const myPlayer = jugadores.find(j => j.user_id === currentUserId)
  if (!myPlayer) return null
  const scores: Record<number, number> = {}
  if (myPlayer.scores) {
    for (const [k, v] of Object.entries(myPlayer.scores)) {
      const n = typeof v === 'number' ? v : Number(v)
      if (n > 0) scores[parseInt(k)] = n
    }
  }
  const data = computeHighlights(scores, parMap, totalHoles)
  if (data.holesPlayed === 0) return null
  return { data, scores }
}
